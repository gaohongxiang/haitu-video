import { createImageProvider, type ImageProvider, type ImageProviderOptions } from "./imageProviderFactory.js";
import { createVideoProvider, type ProviderFactoryOptions } from "./providerFactory.js";
import { createTextProvider } from "./textProviderFactory.js";
import type { TextProvider, TextProviderOptions } from "./textProviderTypes.js";
import type { VideoProvider } from "./types.js";
import type { ModelKind } from "./modelCatalog.js";

export type ModelProviderForKind<T extends ModelKind> =
  T extends "text" ? TextProvider :
  T extends "image" ? ImageProvider :
  VideoProvider;

export type ModelProviderOptionsForKind<T extends ModelKind> =
  T extends "text" ? TextProviderOptions :
  T extends "image" ? ImageProviderOptions :
  ProviderFactoryOptions;

export function createModelProvider<T extends ModelKind>(
  modelKind: T,
  options: ModelProviderOptionsForKind<T> = {} as ModelProviderOptionsForKind<T>
): ModelProviderForKind<T> {
  if (modelKind === "text") {
    return createTextProvider(options as TextProviderOptions) as ModelProviderForKind<T>;
  }
  if (modelKind === "image") {
    return createImageProvider(options as ImageProviderOptions) as ModelProviderForKind<T>;
  }
  return createVideoProvider("volcengine-seedance", options as ProviderFactoryOptions) as ModelProviderForKind<T>;
}
