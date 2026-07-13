import { Request, Response } from "express";
import User from "../models/user.model";
import Currency from "../models/currency.model";
import Wallet from "../models/wallet.model";
import { userToJSON } from "../resources/user.resource";
import {
    hashPassword,
    comparePassword,
    generateToken,
} from "../utils/common.utils";

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.sendError(res.__("1102"), 1102);
        }

        // Hash password using common utility
        const hashedPassword = await hashPassword(password);

        // Create user
        const user = await User.create({
            email,
            password: hashedPassword,
        });

        // Create wallets for all available currencies
        const currencies = await Currency.findAll();
        for (const currency of currencies) {
            await Wallet.create({
                user_id: user.id,
                currency: currency.code,
            });
        }

        // Convert user using resource
        const userResponse = userToJSON(user, req);

        return res.sendResponse(userResponse, res.__("3005"), 3005);
    } catch (error: any) {
        return res.handleError(error);
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Check if user exists (retrieving the password using the withPassword scope)
        const user = await User.scope("withPassword").findOne({
            where: { email },
        });
        if (!user) {
            return res.sendError(res.__("1002"), 1002);
        }

        // Compare password using common utility
        const isMatch = await comparePassword(password, user.password);
        if (!isMatch) {
            return res.sendError(res.__("1005"), 1005);
        }

        // Check and create missing wallets for the user
        const currencies = await Currency.findAll();
        for (const currency of currencies) {
            await Wallet.findOrCreate({
                where: {
                    user_id: user.id,
                    currency: currency.code,
                },
                defaults: {
                    user_id: user.id,
                    currency: currency.code,
                    total: 0.0,
                    remaining: 0.0,
                    onhold: 0.0,
                    used: 0.0,
                },
            });
        }

        // Generate access token
        const accessToken = await generateToken(user.id);

        // Convert user using resource with access token
        const userResponse = userToJSON(user, req, accessToken);

        return res.sendResponse(userResponse, res.__("3011"), 3011);
    } catch (error: any) {
        return res.handleError(error);
    }
};
