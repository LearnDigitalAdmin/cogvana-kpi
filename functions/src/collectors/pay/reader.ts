// PAY adapters read through the shared source reader (core/reader.ts).
// This file keeps their existing imports working.
import type { SourceReader } from "../../core/reader";

export type { DocRecord, RangeQuery, CountQuery, TimeType } from "../../core/reader";
export type PayReader = SourceReader;
