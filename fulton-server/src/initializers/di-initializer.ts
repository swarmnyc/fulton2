import { DiContainer, EntityService, EntityServiceFactory, Type, RepositoryFactory } from "../index";
import { MongoRepository, getConnection, getRepository } from "typeorm";

import { FultonApp } from "../fulton-app";
import { Repository } from "typeorm/repository/Repository";
import { getRepositoryMetadata } from "../entities/repository-decorator-helper";
import { interfaces, Container } from "inversify";
import { MongoEntityRunner } from "../entities/runner/mongo-entity-runner";

export default function diInitializer(app: FultonApp) {
    app.container = new Container();

    // for FultonApp
    app.container.bind(FultonApp).toConstantValue(app);

    // for EntityService
    app.container.bind(EntityService).toFactory(entityServiceFactory);

    // for Repository
    app.container.bind(Repository).toFactory(repositoryFactory);

    // for EntityRunner
    app.container.bind(MongoEntityRunner).toSelf();

    app.events.emit("didInitDiContainer", app);
}

/**
 * a factory for create EntityService
 */
function entityServiceFactory<T>(ctx: interfaces.Context): EntityServiceFactory<T> {
    return (entity: Type<T>) => {
        let service = new EntityService(entity);
        service["app"] = ctx.container.get(FultonApp);

        return service;
    }
}

/**
 * a factory for hacking typeorm to create repository, so make repository can be injectable
 * it should only be used in FultonApp.initRepository()
 */
function repositoryFactory<T>(ctx: interfaces.Context): RepositoryFactory<T> {
    return (repoType: Type<T>) => {
        let metadata = getRepositoryMetadata(repoType);

        let connection = getConnection(metadata.connectionName);
        let entityMetadata = connection.getMetadata(metadata.entity);

        let repository = ctx.container.resolve<any>(repoType) as Repository<T>;

        Object.assign(repository, {
            manager: connection.manager,
            metadata: entityMetadata,
            queryRunner: connection.manager.queryRunner,
        });

        connection.manager["repositories"].push(repository);
        return repository;
    }

}