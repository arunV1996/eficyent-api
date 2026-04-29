import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

/**
 * Validates and replaces req.body / req.query / req.params with the parsed
 * (and stripped) values. Validation errors flow through Zod -> error handler
 * which converts to the standard 422 envelope.
 */

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: Schemas) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  };
}
