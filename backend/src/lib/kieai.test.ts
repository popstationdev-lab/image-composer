import { describe, it, expect } from "vitest";
import { resolutionMap, aspectRatioFromParams } from "./kieai";

describe("kieai lib", () => {
    describe("resolutionMap", () => {
        it("should map 2k to 2K", () => {
            expect(resolutionMap("2k")).toBe("2K");
            expect(resolutionMap("2K")).toBe("2K");
        });

        it("should map 8k to 4K (Kie AI limit)", () => {
            expect(resolutionMap("8k")).toBe("4K");
            expect(resolutionMap("8K")).toBe("4K");
        });

        it("should default to 4K for others", () => {
            expect(resolutionMap("4k")).toBe("4K");
            expect(resolutionMap("blah")).toBe("4K");
        });
    });

    describe("aspectRatioFromParams", () => {
        it("should return 2:3 for full-body", () => {
            expect(aspectRatioFromParams({ framing: "full-body" })).toBe("2:3");
        });

        it("should return 3:4 for waist-legs", () => {
            expect(aspectRatioFromParams({ framing: "waist-legs" })).toBe("3:4");
        });

        it("should default to 2:3", () => {
            expect(aspectRatioFromParams({ framing: "preserve" })).toBe("2:3");
            expect(aspectRatioFromParams({})).toBe("2:3");
        });
    });
});
