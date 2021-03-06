import { ObjectID } from 'bson';
import * as lodash from 'lodash';
import { EntityService } from '../../src/entities/entity-service';
import { FultonApp } from '../../src/fulton-app';
import { FultonUser } from '../../src/identity/fulton-impl/fulton-user';
import { FultonIdentityService } from '../../src/identity/fulton-impl/fulton-identity-service';
import { ICacheServiceFactory } from '../../src/types';
import { DiKeys } from '../../src/keys';
import { FultonAppOptions } from '../../src/options/fulton-app-options';
import { MemoryCacheService } from '../../src/services/cache/memory-cache-service';
import { Category } from '../entities/category';
import { MongoHelper } from "../helpers/mongo-helper";
import { sampleData } from "../support/sample-data";

class MyApp extends FultonApp {
    protected onInit(options: FultonAppOptions): void {
        options.entities = [Category];
        options.cache.enabled = true;
        options.identity.enabled = true;

        options.databases.set("default", {
            type: "mongodb",
            url: "mongodb://localhost:27017/fulton-test"
        });
    }
}

describe('Memory Cache Service', () => {
    let app: MyApp;

    beforeAll(async () => {
        app = new MyApp();
        await app.init();
        await MongoHelper.insertData(lodash.pick(sampleData, ["categories"]), true);
    });

    beforeEach(() => {
        app.getInstance<ICacheServiceFactory>(DiKeys.CacheServiceFactory).resetAll();
    });

    afterAll(async () => {
        await app.stop()
    })

    it('should cache data on find', async () => {
        let entityService = app.getEntityService(Category) as EntityService<Category>
        let cacheService = entityService["cache"]["service"]
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()

        let actualResult = JSON.stringify([
            {
                "categoryId": "000000000000000000000001",
                "categoryName": "Beverages",
                "description": "Soft drinks coffees teas beers and ales"
            },
            {
                "categoryId": "000000000000000000000002",
                "categoryName": "Confections",
                "description": "Desserts candies and sweet breads"
            }
        ])

        let result = await entityService.find({
            filter: {
                categoryId: {
                    $in: ["000000000000000000000001", "000000000000000000000002"]
                }
            },
            cache: true
        })

        expect(JSON.stringify(result.data)).toEqual(actualResult);

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(1)

        result = await entityService.find({
            filter: {
                categoryId: {
                    $in: ["000000000000000000000001", "000000000000000000000002"]
                }
            },
            cache: true
        })

        expect(JSON.stringify(result.data)).toEqual(actualResult);
        expect(result.data[0].constructor).toEqual(Category);

        expect(spyGet.calls.count()).toEqual(2)
        expect(spySet.calls.count()).toEqual(1)
    });

    it('should cache data on findOne', async () => {
        let entityService = app.getEntityService(Category) as EntityService<Category>
        let cacheService = entityService["cache"]["service"]
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()

        let actualResult = JSON.stringify({
            "categoryId": "000000000000000000000001",
            "categoryName": "Beverages",
            "description": "Soft drinks coffees teas beers and ales"
        })

        let result = await entityService.findOne({ filter: { categoryId: "000000000000000000000001" }, cache: true })

        expect(JSON.stringify(result)).toEqual(actualResult);
        expect(result.constructor).toEqual(Category)

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(1)

        result = await entityService.findOne({ filter: { categoryId: "000000000000000000000001" }, cache: true })

        expect(JSON.stringify(result)).toEqual(actualResult);
        expect(result.constructor).toEqual(Category);

        expect(spyGet.calls.count()).toEqual(2)
        expect(spySet.calls.count()).toEqual(1)

        expect(result.constructor).toEqual(Category)
    });

    it('should cache data on findById', async () => {
        let entityService = app.getEntityService(Category) as EntityService<Category>
        let cacheService = entityService["cache"]["service"]
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()

        let actualResult = JSON.stringify({
            "categoryId": "000000000000000000000001",
            "categoryName": "Beverages",
            "description": "Soft drinks coffees teas beers and ales"
        })

        let result = await entityService.findById("000000000000000000000001", { cache: true })

        expect(JSON.stringify(result)).toEqual(actualResult);
        expect(result.constructor).toEqual(Category)

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(1)

        result = await entityService.findById("000000000000000000000001", { cache: true })

        expect(JSON.stringify(result)).toEqual(actualResult);
        expect(result.constructor).toEqual(Category);

        expect(spyGet.calls.count()).toEqual(2)
        expect(spySet.calls.count()).toEqual(1)

        expect(result.constructor).toEqual(Category)
    });

    it('should re get cache after create', async () => {
        let entityService = app.getEntityService(Category) as EntityService<Category>
        let cacheService = entityService["cache"]["service"]
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()
        let spyReset = spyOn(cacheService, "reset").and.callThrough()

        await entityService.findById("000000000000000000000001", { cache: true })

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(1)

        await entityService.create({
            "categoryId": new ObjectID(),
            "categoryName": "Test",
            "description": "Test"
        })

        await entityService.findById("000000000000000000000001", { cache: true })

        expect(spyGet.calls.count()).toEqual(1) // data is dirty, skip get
        expect(spySet.calls.count()).toEqual(2)
        expect(spyReset.calls.count()).toEqual(0)
    });

    it('should re get cache after update', async () => {
        let entityService = app.getEntityService(Category) as EntityService<Category>
        let cacheService = entityService["cache"]["service"]
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()
        let spyReset = spyOn(cacheService, "reset").and.callThrough()

        await entityService.findById("000000000000000000000001", { cache: true })

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(1)

        await entityService.update("000000000000000000000003", {
            "categoryName": "Test",
            "description": "Test"
        })

        await entityService.findById("000000000000000000000001", { cache: true })

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(2)
        expect(spyReset.calls.count()).toEqual(0)
    });

    it('should re get cache after delete', async () => {
        let entityService = app.getEntityService(Category) as EntityService<Category>
        let cacheService = entityService["cache"]["service"]
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()
        let spyReset = spyOn(cacheService, "reset").and.callThrough()

        await entityService.findById("000000000000000000000001", { cache: true })

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(1)

        await entityService.delete("000000000000000000000003")

        await entityService.findById("000000000000000000000001", { cache: true })

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(2)
        expect(spyReset.calls.count()).toEqual(0)
    });

    it('should cache user by token', async () => {
        let identityService = app.identityService as FultonIdentityService

        let cacheService = identityService["cacheService"] as MemoryCacheService
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()

        let user = await identityService.register({
            email: "test@test.com",
            username: "test",
            password: "test123"
        })

        let token1 = await identityService.issueAccessToken(user)

        await identityService.loginByAccessToken(token1.access_token)

        expect(spyGet.calls.count()).toEqual(2)
        expect(spySet.calls.count()).toEqual(2)

        let fetchedUser = await identityService.loginByAccessToken(token1.access_token)
        expect(fetchedUser.constructor).toEqual(FultonUser);

        expect(spyGet.calls.count()).toEqual(3)
        expect(spySet.calls.count()).toEqual(2)

        let token2 = await identityService.issueAccessToken(user)
        await identityService.loginByAccessToken(token2.access_token)

        let memoryCache = cacheService["cache"]
        expect(memoryCache.length).toEqual(3)

        let keys = memoryCache.get(`user:${user.id}`) as string[]
        expect(keys.length).toEqual(2)
        expect(keys).toContain(`token:${token1.access_token}`)
        expect(keys).toContain(`token:${token2.access_token}`)

        // clean cache
        await identityService.updateProfile(user.id, { displayName: "test" })

        expect(memoryCache.length).toEqual(0)
    });

    it('should cache users by tokens isolate', async () => {
        let identityService = app.identityService as FultonIdentityService
        let cacheService = identityService["cacheService"] as MemoryCacheService

        let user1 = await identityService.register({
            email: "test1@test.com",
            username: "test1",
            password: "test123"
        })

        let user2 = await identityService.register({
            email: "test2@test.com",
            username: "test2",
            password: "test123"
        })

        let token1 = await identityService.issueAccessToken(user1)
        let token2 = await identityService.issueAccessToken(user2)

        await identityService.loginByAccessToken(token1.access_token)
        await identityService.loginByAccessToken(token2.access_token)

        let memoryCache = cacheService["cache"]
        expect(memoryCache.length).toEqual(4)

        // clean cache
        await identityService.updateProfile(user1.id, { displayName: "test" })

        expect(memoryCache.length).toEqual(2)
    });

    it('should cache fit by wrong token', async () => {
        let identityService = app.identityService as FultonIdentityService

        let cacheService = identityService["cacheService"]
        let spyGet = spyOn(cacheService, "get").and.callThrough()
        let spySet = spyOn(cacheService, "set").and.callThrough()

        let token = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjViZmYyNTIzYTZkNDEzYjMwY2ZiMTE0YiIsInRzIjoxNTQzNDQ3ODQzMzM5fQ.HYjlzIzvezTnWrZA50VKgZ_OksuqCkckVqqQnOqoriE"

        let fetchedUser = await identityService.loginByAccessToken(token)
        expect(fetchedUser).toBeNull()

        expect(spyGet.calls.count()).toEqual(1)
        expect(spySet.calls.count()).toEqual(1)

        fetchedUser = await identityService.loginByAccessToken(token)
        expect(fetchedUser).toBeNull()

        expect(spyGet.calls.count()).toEqual(2)
        expect(spySet.calls.count()).toEqual(1)
    });
});