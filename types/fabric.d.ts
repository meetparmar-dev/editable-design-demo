import "fabric";

/**
 * Custom metadata we attach to Fabric objects.
 *
 * - `designId`: links a Textbox back to its DesignText, so the layers list and
 *   the canvas selection can find each other.
 * - `isBackground`: marks the locked background image, so render/export logic
 *   can treat it specially without holding a separate reference everywhere.
 *
 * Declaring them on FabricObject (the base class) makes them type-safe on every
 * subclass — Textbox, FabricImage, etc.
 */
declare module "fabric" {
  interface FabricObject {
    designId?: string;
    isBackground?: boolean;
    /** A patch that hides an original baked-in region (see lib/fabric/coverPatch). */
    isCover?: boolean;
  }
}
