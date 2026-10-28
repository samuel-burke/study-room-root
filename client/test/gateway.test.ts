import { describe, expect, it } from "vitest";
import { demoOptionsFromSearch } from "../src/api/demoGateway";
import { GatewayError, toGatewayError } from "../src/api/gateway";

describe("toGatewayError", () => {
  it("keeps app errors with a code and message", () => {
    const error = toGatewayError({ code: 1001, message: "Goal can't be empty." });
    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ code: 1001, message: "Goal can't be empty." });
  });

  it("replaces SDK and network errors with a friendly message", () => {
    expect(toGatewayError(new TypeError("Failed to fetch")).message).toMatch(
      /Couldn't reach Study Room/,
    );
    expect(toGatewayError({ code: -2, message: "RequestTimeout" }).code).toBe(0);
    expect(toGatewayError(undefined).code).toBe(0);
  });
});

describe("demoOptionsFromSearch", () => {
  it("opens mid-round with bots by default", () => {
    expect(demoOptionsFromSearch("")).toEqual({
      focusMinutes: undefined,
      breakMinutes: undefined,
      elapsedMinutes: 10.5,
      bots: true,
    });
  });

  it("reads fast presets for tests and ignores junk", () => {
    expect(demoOptionsFromSearch("?focus=0.2&break=0.1&bots=0")).toEqual({
      focusMinutes: 0.2,
      breakMinutes: 0.1,
      elapsedMinutes: 0,
      bots: false,
    });
    expect(demoOptionsFromSearch("?focus=-1&elapsed=abc").focusMinutes).toBeUndefined();
  });
});
