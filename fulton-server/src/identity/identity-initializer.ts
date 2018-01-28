import * as passport from 'passport';

import { FultonUser, Type, IFultonUser } from '../index';
import { IStrategyOptionsWithRequest, Strategy as LocalStrategy } from 'passport-local';
import { Strategy } from 'passport';
import { IUser, IUserService } from './interfaces';

import { Strategy as BearerStrategy } from 'passport-http-bearer';
import { FultonApp } from "../fulton-app";
import { getRepository } from 'typeorm';
import { GoogleStrategy } from './strategies/google-strategy';
import Helper from '../helpers/helper';

module.exports = async function identityInitializer(app: FultonApp) {
    let idOptions = app.options.identity;
    if (idOptions.enabled) {
        if (idOptions.userService == null) {
            throw new Error("identity.userService can't be null when userService.enabled is true.");
        }

        let userService: IUserService<IUser>;

        if (idOptions.userService instanceof Function) {
            if (idOptions.userRepository) {
                // use specical repository
                if (idOptions.userRepository instanceof Function) {
                    app.container.bind("UserRepository").to(idOptions.userRepository);
                } else {
                    app.container.bind("UserRepository").toConstantValue(idOptions.userRepository);
                }
            } else {
                // use typeorm repository
                let userRepository = getRepository(idOptions.userType);

                app.container.bind("UserRepository").toConstantValue(userRepository);
            }

            userService = app.container.resolve(idOptions.userService as Type);
        } else {
            userService = idOptions.userService as IUserService<IUser>;
        }

        // register userService
        app.server.request.constructor.prototype.userService = userService;

        app.server.use(passport.initialize());

        // for register
        if (idOptions.register.enabled) {
            let registerOptions = idOptions.register;
            let httpMethod = app.server[registerOptions.httpMethod];
            httpMethod.call(app.server, registerOptions.path, registerOptions.handler);
        }

        // add pre-defined login strategy
        if (idOptions.login.enabled) {
            let opts = idOptions.login;

            idOptions.addStrategy({
                httpMethod: opts.httpMethod,
                path: opts.path,
                verifier: opts.verifier,
                successMiddleware: opts.successMiddleware,
                strategyOptions: {
                    usernameField: opts.usernameField,
                    passwordField: opts.passwordField
                },
                authenticateOptions: opts.authenticateOptions
            }, LocalStrategy);
        }

        // add pre-defined bearer strategy
        if (idOptions.bearer.enabled) {
            let opts = idOptions.bearer;

            idOptions.addStrategy({
                addToDefaultAuthenticateList: true,
                verifier: opts.verifier
            }, BearerStrategy);
        }

        // add pre-defined google strategy
        if (idOptions.google.enabled) {
            let opts = idOptions.google;

            Helper.setValue(opts, "strategyOptions", {});
            Helper.setValue(opts.strategyOptions, "accessType", opts.accessType);

            idOptions.addStrategy(
                idOptions.google,
                GoogleStrategy
            )
        }

        // add pre-defined github strategy
        if (idOptions.github.enabled) {
            let opts = idOptions.github;

            Helper.setValue(opts, "strategyOptions", {});
            Helper.setValue(opts.strategyOptions, "clientID", opts.clientId);
            Helper.setValue(opts, "prfoileTransformer", (profile: any) => {
                let email;
                if (profile.emails instanceof Array) {
                    email = profile.emails.find((e: any) => e.primary || e.primary == null).value;
                } else {
                    email = profile.email;
                }

                let user: IFultonUser = {
                    email: email,
                    username: email,
                    displayName: profile.displayName,
                    portraitUrl: profile._json.avatar_url
                };

                return user;
            });

            // require passport-github when github.enabled = true;
            let githubStrategy = require("passport-github").Strategy;
            idOptions.addStrategy(
                opts,
                githubStrategy
            )
        }

        // register strategies to passport and express
        for (const { options, strategy } of idOptions.strategies) {
            if (!options.enabled) continue;

            // register passport
            let instance: Strategy;

            if (strategy instanceof Function) {
                let opts = Helper.setValue(options, "strategyOptions", {});

                Helper.setValue(opts, "clientId", options.clientId);
                Helper.setValue(opts, "clientSecret", options.clientSecret);
                Helper.setValue(opts, "callbackUrl", options.callbackUrl);
                Helper.setValue(opts, "scope", options.scope);
                Helper.setValue(opts, "passReqToCallback", true);

                if (options.verifierFn) {
                    options.verifier = options.verifierFn(options);
                }

                instance = new strategy(opts, options.verifier);
            } else {
                instance = strategy
            }

            options.name = options.name || instance.name;

            passport.use(options.name, instance);

            // register to express
            if (options.path) {
                // for regular strategy
                let args: any[] = [];

                let opts = Helper.setValue(options, "callbackAuthenticateOptions", {});
                Helper.setValue(opts, "passReqToCallback", true);
                Helper.setValue(opts, "session", false);

                if (options.authenticateFn) {
                    args.push(options.authenticateFn(options))
                } else {
                    args.push(passport.authenticate(options.name, opts))
                }

                if (options.successMiddleware) {
                    args.push(options.successMiddleware);
                }

                let httpMethod = app.server[options.httpMethod || "get"];
                httpMethod.apply(app.server, [options.path, args]);
            }

            if (options.callbackPath) {
                // for oauth strategy 
                let args: any[] = [];

                let opts = Helper.setValue(options, "callbackAuthenticateOptions", {});
                Helper.setValue(opts, "passReqToCallback", true);
                Helper.setValue(opts, "session", false);

                if (options.callbackAuthenticateFn) {
                    args.push(options.callbackAuthenticateFn(options))
                } else {
                    args.push(passport.authenticate(options.name, opts))
                }

                if (options.callbackSuccessMiddleware) {
                    args.push(options.callbackSuccessMiddleware);
                }

                let httpMethod = app.server[options.callbackHttpMethod || "get"];
                httpMethod.apply(app.server, [options.callbackPath, args]);
            }

            if (options.addToDefaultAuthenticateList) {
                idOptions.defaultAuthSupportStrategies.push(options.name);
            }
        }

        if (idOptions.defaultAuthenticate && idOptions.defaultAuthSupportStrategies.length > 0) {
            app.server.use(idOptions.defaultAuthenticate);
        }
    }
}