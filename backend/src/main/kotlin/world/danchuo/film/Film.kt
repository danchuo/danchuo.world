/**
 * The **film** slice: photos arrive as drops (~36 frames as a zip through /admin, since a shortcut
 * cannot post that many files). Upload unpacks, resizes each frame into web and thumb honouring
 * EXIF, and stores bytes in [PhotoStorage]. Imaging never leaks into core. PRD §5.12, DESIGN §7.5
 */
package world.danchuo.film
