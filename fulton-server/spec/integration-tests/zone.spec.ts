import { FultonApp } from "../../src/fulton-app";
import { FultonAppOptions } from "../../src/fulton-app-options";
import { router, Router, httpGet, Request, Response, Service } from "../../src/index";
import { HttpTester } from "../helpers/http-tester";
import { setTimeout } from "timers";

class TestService extends Service {
    getId() {
        return this.app.getLocalData("id")
    }

    setId(value: any) {
        this.app.setLocalData("id", value);
    }
}

@router("/test")
class TestRouter extends Router {
    constructor(private service: TestService) {
        super();
    }

    @httpGet()
    async get(req: Request, res: Response) {
        this.service.setId(req.query.id)
        
        await this.delay(req.query.id).then(() => {
            console.log(`id:${req.query.id}, then, zone:${Zone.current.name}`);
        });

        console.log(`id:${req.query.id}, after await, zone:${Zone.current.name}`);

        res.send(this.service.getId());

    }

    delay(id: string): Promise<void> {
        console.log(`id:${id}, delaying, zone:${Zone.current.name}`);

        return new Promise((resolve, reject) => {
            console.log(`id:${id}, delayed, zone:${Zone.current.name}`);

            setTimeout(() => {
                console.log(`id:${id}, resolved, zone:${Zone.current.name}`);
                resolve();
            }, Math.random() * 1000);
        });

    }
}

class MyApp extends FultonApp {
    protected onInit(options: FultonAppOptions): void | Promise<void> {
        options.services.push(TestService);
        options.routers.push(TestRouter);
    }
}

describe('Zone', () => {
    let app: MyApp;
    let httpTester: HttpTester;

    beforeAll(async () => {
        app = new MyApp();
        httpTester = new HttpTester(app);
        return httpTester.start();
    });

    afterAll(async () => {
        return httpTester.stop();
    });

    it('should works', async () => {
        let task1 = httpTester.get("/test?id=1");
        let task2 = httpTester.get("/test?id=2");
        let task3 = httpTester.get("/test?id=3");

        let result1 = await task1;
        let result2 = await task2;
        let result3 = await task3;

        expect(result1.body).toEqual("1")
        expect(result2.body).toEqual("2")
        expect(result3.body).toEqual("3")
    });
});