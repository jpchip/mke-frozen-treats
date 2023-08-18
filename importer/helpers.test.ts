import { assertExists } from "https://deno.land/std@0.198.0/assert/mod.ts";
import {
    assertSpyCall,
    spy,
  } from "https://deno.land/std@0.165.0/testing/mock.ts";
import { getJson } from "./helpers.ts";

Deno.test("getJson writes to console on failure", async () => {
    const logSpy = spy(console, "log");
    await getJson('doesnotexist.file')
  
    assertSpyCall(logSpy, 0);
});

Deno.test("getJson gets file if it exists", async () => {
    const result = await getJson('./sites.json') 
    assertExists(result);
});