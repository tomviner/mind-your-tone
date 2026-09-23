import dimensionData from "../worker/dimensions.json";

export const DIMENSIONS = dimensionData;

export type DimensionKey = keyof typeof DIMENSIONS;

export const DIMENSION_KEYS = Object.keys(DIMENSIONS) as DimensionKey[];
