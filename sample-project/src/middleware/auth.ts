import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/user.model";

// Extend Request type to hold the authenticated user
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

export const verifyJWT = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.sendError(res.__("1006"), 1006);
        }

        const token = authHeader.split(" ")[1];
        const secret = process.env.JWT_SECRET || "default_secret";

        try {
            const decoded = jwt.verify(token, secret) as { userId: number };
            const user = await User.findByPk(decoded.userId);
            if (!user) {
                return res.sendError(res.__("1002"), 1002);
            }

            req.user = user;
            next();
        } catch (err) {
            return res.sendError(res.__("1007"), 1007);
        }
    } catch (error: any) {
        return res.handleError(error);
    }
};
