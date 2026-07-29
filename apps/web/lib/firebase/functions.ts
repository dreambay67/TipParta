'use client';

import { getFunctions } from "firebase/functions";
import { app } from "./client";

export const functions = getFunctions(app);
