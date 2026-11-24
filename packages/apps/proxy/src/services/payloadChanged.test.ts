import { payloadChanged } from "./payloadChanged";

describe("payloadChanged", () => {
  it("is true when dateUpdated differs, without stringifying", () => {
    const stringify = jest.spyOn(JSON, "stringify");
    expect(
      payloadChanged(
        { dateUpdated: "2026-11-24T10:00:00Z", features: {} },
        { dateUpdated: "2026-11-24T11:00:00Z", features: {} },
      ),
    ).toBe(true);
    expect(stringify).not.toHaveBeenCalled();
    stringify.mockRestore();
  });

  it("compares contents when dateUpdated matches", () => {
    const date = "2026-11-24T10:00:00Z";
    expect(
      payloadChanged(
        { dateUpdated: date, features: { a: 1 } },
        { dateUpdated: date, features: { a: 2 } },
      ),
    ).toBe(true);
    expect(
      payloadChanged(
        { dateUpdated: date, features: { a: 1 } },
        { dateUpdated: date, features: { a: 1 } },
      ),
    ).toBe(false);
  });

  it("compares contents when dateUpdated is missing", () => {
    expect(payloadChanged({ a: 1 }, undefined)).toBe(true);
    expect(payloadChanged({ a: 1 }, { a: 1 })).toBe(false);
    expect(payloadChanged("", "")).toBe(false);
  });
});
