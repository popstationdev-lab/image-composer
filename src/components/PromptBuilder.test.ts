import { describe, it, expect } from "vitest";
import { assemblePrompt, PromptParams } from "./PromptBuilder";

describe("assemblePrompt", () => {
    const baseParams: PromptParams = {
        preserveHead: true,
        preserveOtherGarments: false,
        view: "front",
        fitStrictness: 50,
        shadowEnforcement: true,
        shadowLevel: "medium",
        framing: "preserve",
        resolution: "4k",
        variations: 1,
        quality: "balanced",
        customPrompt: "",
    };

    it("should generate a valid prompt with default params", () => {
        const prompt = assemblePrompt(baseParams);
        expect(prompt).toContain("Professional fashion photography");
        expect(prompt).toContain("front-view");
        expect(prompt).toContain("Preserve model's original head");
        expect(prompt).toContain("medium shadows");
    });

    it("should handle different views", () => {
        const sidePrompt = assemblePrompt({ ...baseParams, view: "side" });
        expect(sidePrompt).toContain("side-view");
        expect(sidePrompt).toContain("side-profile angle");

        const backPrompt = assemblePrompt({ ...baseParams, view: "back" });
        expect(backPrompt).toContain("back-view");
        expect(backPrompt).toContain("rear view");
    });

    it("should handle fit strictness levels", () => {
        const softPrompt = assemblePrompt({ ...baseParams, fitStrictness: 10 });
        expect(softPrompt).toContain("Soft draping");

        const mediumPrompt = assemblePrompt({ ...baseParams, fitStrictness: 50 });
        expect(mediumPrompt).toContain("True-to-garment fit");

        const strictPrompt = assemblePrompt({ ...baseParams, fitStrictness: 90 });
        expect(strictPrompt).toContain("Strict garment fit preservation");
    });

    it("should handle framing options", () => {
        const fullBodyPrompt = assemblePrompt({ ...baseParams, framing: "full-body" });
        expect(fullBodyPrompt).toContain("Full-body composition");

        const waistPrompt = assemblePrompt({ ...baseParams, framing: "waist-legs" });
        expect(waistPrompt).toContain("include waist and legs");
    });

    it("should respect preserveHead and preserveOtherGarments", () => {
        const headPrompt = assemblePrompt({ ...baseParams, preserveHead: true });
        expect(headPrompt).toContain("Preserve model's original head");

        const noHeadPrompt = assemblePrompt({ ...baseParams, preserveHead: false });
        expect(noHeadPrompt).not.toContain("Preserve model's original head");

        const garmentsPrompt = assemblePrompt({ ...baseParams, preserveOtherGarments: true });
        expect(garmentsPrompt).toContain("Preserve all other garments");
    });
});
