import { describe, it, expect } from "vitest";
import { isSafePrompt, isSafeImage } from "./safety";

describe("safety lib", () => {
    describe("isSafePrompt", () => {
        it("should return true for clean prompts", () => {
            expect(isSafePrompt("A professional model wearing a blue dress")).toBe(true);
            expect(isSafePrompt("Studio lighting, 4k resolution")).toBe(true);
        });

        it("should return false for blacklisted terms", () => {
            expect(isSafePrompt("naked person in a park")).toBe(false);
            expect(isSafePrompt("NSFW content here")).toBe(false);
            expect(isSafePrompt("Explicit imagery requested")).toBe(false);
        });

        it("should be case-insensitive", () => {
            expect(isSafePrompt("NAKED")).toBe(false);
            expect(isSafePrompt("nUdE")).toBe(false);
        });
    });

    describe("isSafeImage", () => {
        it("should return true for now (stub implementation)", async () => {
            const buffer = Buffer.from("fake-image-data");
            const isSafe = await isSafeImage(buffer, "image/png");
            expect(isSafe).toBe(true);
        });
    });
});
