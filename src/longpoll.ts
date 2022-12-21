import {EventEmitter} from "events";
import {Express, RequestHandler, Request, Response, NextFunction} from "express";

/**
 * Forked from express-longpoll Copyright 2017 Yehya Awad
 * https://github.com/yehya/express-longpoll
 */
export default function longpoll(app: Express, opts = {
  DEBUG: false,
  events: {
    maxListeners: 0 // unlimited
  }
}) {
  let express_longpoll_emitters: {[url: string]: EventEmitter} = {};
  let _app = app;

  let _newDispatcher = function(url: string) {

    // Init EventEmitter
    let dispatcher = new EventEmitter();

    if (opts?.events?.maxListeners > 0) {
      dispatcher.setMaxListeners(opts.events.maxListeners);
    }

    express_longpoll_emitters[url] = dispatcher;
    return dispatcher;
  };

  return {
    // Has middleware that assigns a req.id to emit events at specific users only
    _createWithId: function (url: string, middleware: RequestHandler|undefined = undefined) {
      return this._setupListener(url, "longpoll", middleware);
    },

    // method that sets up ID
    use: function (middleware: RequestHandler) {
      _app.use(middleware);
    },

    // Create a new longpoll
    create: function (url: string, middleware: RequestHandler|undefined = undefined) {
      if (typeof middleware === "function") {
        return this._createWithId(url, middleware);
      }
      return this._setupListener(url, "longpoll", null, opts);
    },

    // Publishes to everyone listening to this long poll
    publish: function (url: string, data: any) {
      return new Promise<void>(function (resolve, reject) {
        if (express_longpoll_emitters[url]) {
          express_longpoll_emitters[url].emit('longpoll', data);
          resolve();
        } else {
          reject("Longpoll with the provided URL does not exist: " + url);
        }
      });
    },

    // Pushes data to listeners with an extra ID
    publishToId: function (url: string, id: string, data: any) {
      return this._emit(url, "longpoll." + id, data);
    },

    // Set up the longpoll listener in an express .get route
    _setupListener: function (url: string, event: Event, middleware: RequestHandler|undefined = undefined) {
      if (middleware === undefined) {
        middleware = (req: Request, res: Response, next: NextFunction) => next();
      }
      return new Promise<void>((resolve, reject) => {

        // Check if longpoll for URL already exists
        if (express_longpoll_emitters[url]) {
          return reject("URL already in use: " + url);
        }

        // Set up new dispatcher for the URL
        let dispatcher = _newDispatcher(url);

        // Set up the GET handler for a longpoll request
        _app.get(url, middleware as RequestHandler, (req: Request, res: Response) => {
          let eventId = "longpoll";

          // Check if there is an ID associated with the request
          if (res.locals?.id) {
            // Add the ID to the event listener
            eventId = eventId + "." + res.locals.id;
            // Clear all previous events for the ID, we only need one
            dispatcher.removeAllListeners(eventId);
          }

          // Method that Creates event listener
          let sub = function (res: Response) {
            dispatcher.once(eventId, function (data) {
              res.json(data);
            });
          }

          // Create it
          sub(res);
        });
        resolve();
      });
    },

    // Emits an event to an event listener
    _emit: function (url: string, eventName: string, data: any) {
      return new Promise<void>(function (resolve, reject) {
        if (express_longpoll_emitters[url]) {
          express_longpoll_emitters[url].emit(eventName, data);
          resolve();
        } else {
          reject("Subscription with the provided URL does not exist: " + url);
        }
      });
    }

  };
};
