import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

/**
 * A utility function to merge Tailwind CSS classes with conditional classes
 * @param {Array} inputs - Array of class strings or objects with conditional classes
 * @returns {string} - Merged class string
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
