/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Maximum Results - Maximum number of notes to load from the Notes database */
	"maxResults": string;

	/** Default Folder - Folder used when creating a note (falls back to the default Notes folder) */
	"defaultFolder": string;

	/** Show Apple Note Preview - Toggle the side preview in the search list */
	"showDetailByDefault": boolean;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Search Apple Notes */
	export type SearchNotes = ExtensionPreferences & {
		
	}

	/** Command: New Apple Note */
	export type CreateNote = ExtensionPreferences & {
		
	}

	/** Command: Move Apple Note to folder */
	export type MoveNote = ExtensionPreferences & {
		
	}

	/** Command: View Selected Apple Note */
	export type ViewSelectedNote = ExtensionPreferences & {
		
	}

	/** Command: Export Apple Notes */
	export type ExportNotes = ExtensionPreferences & {
		
	}

	/** Command: Manage Apple Note Templates */
	export type ManageTemplates = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Search Apple Notes */
	export type SearchNotes = {
		
	}

	/** Command: New Apple Note */
	export type CreateNote = {
		
	}

	/** Command: Move Apple Note to folder */
	export type MoveNote = {
		
	}

	/** Command: View Selected Apple Note */
	export type ViewSelectedNote = {
		
	}

	/** Command: Export Apple Notes */
	export type ExportNotes = {
		
	}

	/** Command: Manage Apple Note Templates */
	export type ManageTemplates = {
		
	}
}