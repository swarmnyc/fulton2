import { RelatedToMetadata } from './entities/entity-decorators-helpers';
import { IFultonApp } from "./fulton-app";
import { OauthStrategyVerifier } from "./identity";
// custom types for helping development;
declare global {
    interface String {
        /**
         * compare two strings are the same or not with case insensitive 
         */
        same(str: any): boolean
    }

    type SuppressChecking = any
}

declare module "passport" {
    interface PassportStatic {
        _strategy(name: string): OAuthStrategy
    }

    interface Strategy {
        app?: IFultonApp
    }

    interface OAuthStrategy {
        _verify: OauthStrategyVerifier
        userProfile(accessToken: string, done: (error: any, profile?: any) => void): void
    }
}

declare module "winston" {
    interface TransportInstance {
        colorize?: boolean | 'all' | 'level' | 'message';
    }
}

declare module "typeorm/metadata/EntityMetadata" {
    interface EntityMetadata {
        relatedToMetadata: RelatedToMetadata
    }
}

/**
 * compare two strings are the same or not with case insensitive 
 */
String.prototype.same = function (str: any) {
    if (str == null) return false;
    if (typeof str != "string") return false;

    return this.toLowerCase() == str.toLowerCase();
}