import { ObjectId } from 'bson';
import { getMongoRepository, MongoRepository } from "typeorm";
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { EntityMetadata } from 'typeorm/metadata/EntityMetadata';
import { injectable } from '../../alias';
import { FultonError } from '../../common';
import { FultonStackError } from '../../common/fulton-error';
import { FindResult, QueryColumnOptions, QueryParams } from '../../interfaces';
import { EntityRunner } from './entity-runner';

interface IncludeOptions {
    [key: string]: IncludeOptions | false
}

@injectable()
export class MongoEntityRunner extends EntityRunner {
    updateIdMetadata<T>(repository: MongoRepository<T>) {
        let metadata = repository.metadata

        // make metadata for mongo 
        let idColumn = metadata.ownColumns.find((c) => c.propertyName == "id")

        if (idColumn && idColumn.isObjectId == false) {
            idColumn.isObjectId = true;
            idColumn.givenDatabaseName =
                idColumn.databaseNameWithoutPrefixes =
                idColumn.databaseName = "_id";

            metadata.generatedColumns = [idColumn]
            metadata.objectIdColumn = idColumn
        }
    }

    /**
     * use provided repository to find entities
     * @param repository 
     * @param queryParams 
     */
    protected async findCore<T>(repository: MongoRepository<T>, queryParams: QueryParams = {}): Promise<FindResult<T>> {
        let skip;
        let size;
        if (queryParams.pagination) {
            size = queryParams.pagination.size;
            if (queryParams.pagination.index && queryParams.pagination.size) {
                skip = queryParams.pagination.index * size;
            }
        }

        let cursor = repository.createEntityCursor(queryParams.filter)
        if (skip) cursor.skip(skip)
        if (size) cursor.limit(size)
        if (queryParams.sort) cursor.sort(queryParams.sort)
        if (queryParams.projection) cursor.project(queryParams.projection)

        const [data, count] = await Promise.all<any>([
            cursor.toArray(),
            repository.count(queryParams.filter),
        ]);

        if (data.length > 0 && queryParams.includes) {
            await this.processIncludes(repository, data, queryParams.includes);
        }

        return { data: data, total: count };
    }

    /**
     * use provided repository to find one entity
     * @param repository 
     * @param queryParams 
     */
    protected async findOneCore<T>(repository: MongoRepository<T>, queryParams: QueryParams = {}): Promise<T> {
        let repo = (<any>repository as MongoRepository<T>);

        let cursor = repo.createEntityCursor(queryParams.filter)
        if (queryParams.sort) cursor.sort(queryParams.sort)
        if (queryParams.projection) cursor.project(queryParams.projection)

        const result = await cursor.limit(1).toArray()
        const data = result.length > 0 ? result[0] : null

        if (data && queryParams.includes) {
            await this.processIncludes(repo, data, queryParams.includes);
        }

        return data
    }

    protected createCore<T extends any>(repository: MongoRepository<T>, entity: T): Promise<T> {
        if (entity[repository.metadata.objectIdColumn.propertyName]) {
            // TODO: should move this code to typeorm
            entity._id = entity[repository.metadata.objectIdColumn.propertyName];
            delete entity[repository.metadata.objectIdColumn.propertyName];
        }

        return repository.insertOne(entity).then((result) => {
            // TODO: should move this code to typeorm
            entity[repository.metadata.objectIdColumn.propertyName] = entity._id;
            delete entity._id;

            return entity
        });
    }

    protected createManyCore<T extends any>(repository: MongoRepository<T>, entities: T[]): Promise<T[]> {
        entities.forEach((entity) => {
            if (entity[repository.metadata.objectIdColumn.propertyName]) {
                // TODO: should move this code to typeorm
                entity._id = entity[repository.metadata.objectIdColumn.propertyName];
                delete entity[repository.metadata.objectIdColumn.propertyName];
            }
        })


        return repository.insertMany(entities).then(() => {
            // TODO: should move this code to typeorm
            entities.forEach((entity, i) => {
                entity[repository.metadata.objectIdColumn.propertyName] = entity._id;
                delete entity._id;
            })

            return entities
        });
    }

    protected updateCore<T extends any>(repository: MongoRepository<T>, id: any, update: T): Promise<any> {
        // no id inside of update
        delete update[repository.metadata.objectIdColumn.propertyName];

        return repository.updateOne({ _id: id }, this.convertUpdate(update)).then((result) => {
            if (result.matchedCount == 0) {
                return Promise.reject(new FultonError("unmatched_id"))
            }
        })
    }

    protected updateManyCore<T extends any>(repository: MongoRepository<T>, filter: any, update: T): Promise<number> {
        return repository.updateMany(filter, this.convertUpdate(update)).then((result) => {
            return result.matchedCount
        })
    }

    protected deleteCore<T>(repository: MongoRepository<T>, id: any): Promise<any> {
        return repository.deleteOne({ _id: id })
    }

    protected deleteManyCore<T extends any>(repository: MongoRepository<T>, query: any): Promise<number> {
        return repository.deleteMany(query).then((result) => {
            return result.deletedCount
        })
    }

    protected extendedConvertValue(metadata: string | ColumnMetadata, value: any, errorTracker: FultonStackError): any {
        if (metadata != null && value != null) {
            let type: any;
            if (metadata instanceof ColumnMetadata) {
                type = metadata.type;

                if (!type && metadata.isObjectId) {
                    type = "ObjectId"
                }
            } else {
                type = metadata;
            }

            if ((type == ObjectId || "ObjectId".same(type)) && value.constructor.name != "ObjectID") {
                try {
                    return new ObjectId(value);
                } catch  {
                    errorTracker.add("object_id", "must be an object id", true);
                }
            }
        }

        return value;
    }

    /**
     * adjust filter like change id to _id, change $like to {$regex, $options} 
     */
    protected extendedAdjustFilter<T>(filter: any, name: string, value: string, targetColumn: ColumnMetadata, errorTracker: FultonStackError): void {
        if (name == "$like") {
            filter["$regex"] = value;
            filter["$options"] = "i";
            delete filter["$like"]

            return;
        }

        if (targetColumn && targetColumn.isObjectId && name != "_id") {
            filter._id = value;
            delete filter[name];

            return;
        }
    }

    protected processIncludes<T>(repository: MongoRepository<T>, data: T | T[], includes: string[]): Promise<any> {
        let includeOptions = this.transformIncludes(includes);

        if (data instanceof Array) {
            let tasks = data.map((d) => {
                return this.processIncludeInternal(repository, d, includeOptions);
            })

            return Promise.all(tasks);
        } else if (data) {
            return this.processIncludeInternal(repository, data, includeOptions);
        }
    }


    protected adjustParams<T>(metadata: EntityMetadata, params: QueryParams = {}, onlyFilter: boolean = false): FultonError {
        if (!onlyFilter) {
            if (params.select) {
                params.projection = this.transformSelect(params.select);
            }

            if (params.sort) {
                this.adjustIdInOptions(metadata, params.sort);
            }

            if (params.projection) {
                this.adjustIdInOptions(metadata, params.projection);
            }

            let projection = this.mergeProjection(metadata, params.projection)
            if (projection) {
                params.projection = projection
            }
        }

        return super.adjustParams(metadata, params)
    }

    /**
     * adjust options like change id to _id
     */
    private adjustIdInOptions<T>(metadata: EntityMetadata, options: any) {
        // TODO: should move this code to typeorm
        let idName = metadata.objectIdColumn.propertyName;

        for (const name of Object.getOwnPropertyNames(options)) {
            if (name == idName) {
                // TODO: should move this code to typeorm
                options._id = options[name];
                delete options[idName]
            } else if (name == "id") {
                options._id = options[name];
                delete options["id"]
            }
        }
    }

    /**
     * transform select to projection
     * @param queryParams 
     */
    private transformSelect(select: string[]): QueryColumnOptions {
        let options: QueryColumnOptions = {};

        for (const s of select) {
            options[s] = 1;
        }

        return options
    }

    /**
     * merge metadata to projection
     * @param queryParams 
     */
    private mergeProjection(metadata: EntityMetadata, projection: QueryColumnOptions = {}): QueryColumnOptions {
        metadata.columns.forEach((c) => {
            if (!c.isSelect) {
                if (projection[c.propertyPath] && projection[c.propertyPath] != 0) {
                    // override the entity metadata
                    delete projection[c.propertyPath]
                } else {
                    // hide the column
                    projection[c.propertyPath] = 0;
                }
            }
        })

        if (Object.getOwnPropertyNames(projection).length == 0) {
            return null
        } else {
            return projection
        }
    }

    /**
     * transform ["author", "author.tag"] to { author: { tag: false }}
     * @param includes 
     */
    private transformIncludes(includes: string[]): IncludeOptions {
        let options: IncludeOptions = {};

        for (const include of includes) {
            let columns = include.split(".");
            let target = options;

            for (let i = 1; i <= columns.length; i++) {
                let column = columns[i - 1];
                if (i == columns.length) {
                    target[column] = false;
                } else {
                    if (target[column]) {
                        target = target[column] as IncludeOptions;
                    } else {
                        target = target[column] = {} as IncludeOptions;
                    }
                }
            }

        }

        return options;
    }

    private processIncludeInternal(repository: MongoRepository<any>, target: any, options: IncludeOptions): Promise<any> {
        //TODO: should cover more situations and better performance
        let tasks = Object.getOwnPropertyNames(options).map((columnName): Promise<any> => {
            let relatedToMetadata = repository.metadata.relatedToMetadata;

            if (relatedToMetadata == null || relatedToMetadata[columnName] == null) {
                return;
            }

            let relItems = target[columnName];
            if (relItems == null) {
                return;
            }

            let relType = relatedToMetadata[columnName];
            let relRepo = getMongoRepository(relType);

            let fetchSubInclude = async (ref: any): Promise<any> => {
                // includes sub-columns
                if (options[columnName]) {
                    await this.processIncludeInternal(relRepo, ref, options[columnName] as IncludeOptions);
                }

                return ref;
            }

            let fetchTask;
            if (relItems instanceof Array) {
                if (relItems.length == 0) {
                    return;
                }

                let ids = relItems.map((item) => item[relRepo.metadata.objectIdColumn.propertyName] || item._id);

                fetchTask = this.find(relRepo, { filter: { "_id": { "$in": ids } } }).then((result) => {
                    let refs = result.data;
                    if (refs.length == 0) {
                        return [];
                    } else {
                        return Promise.all(refs.map(fetchSubInclude)).then(() => {
                            return refs;
                        });
                    }
                });
            } else {
                let id = relItems[relRepo.metadata.objectIdColumn.propertyName] || relItems._id;

                fetchTask = this.findOne(relRepo, { filter: { "_id": id } }).then(fetchSubInclude);
            }

            return fetchTask.then(data => {
                target[columnName] = data;
            });
        });

        return Promise.all(tasks);
    }

    private convertUpdate(input: any): any {
        Object.getOwnPropertyNames(input).forEach((name) => {
            if (!name.startsWith("$")) {
                if (input["$set"] == null) {
                    input["$set"] = {}
                }

                input["$set"][name] = input[name]
                delete input[name]
            }
        })

        return input
    }
}