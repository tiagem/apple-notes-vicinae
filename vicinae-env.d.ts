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

	/** Show Note Preview - Toggle the side preview in the search list */
	"showDetailByDefault": boolean;

	/** Edit behavior - Pop back to the notes list after saving note edits */
	"popToListAfterEdit": boolean;

	/** Create behavior - Open the notes list after creating a note */
	"showListAfterCreate": boolean;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Search Notes */
	export type SearchNotes = ExtensionPreferences & {
		
	}

	/** Command: New Note */
	export type CreateNote = ExtensionPreferences & {
		
	}

	/** Command: Move Note to folder */
	export type MoveNote = ExtensionPreferences & {
		
	}

	/** Command: View Selected Note */
	export type ViewSelectedNote = ExtensionPreferences & {
		
	}

	/** Command: Export Notes */
	export type ExportNotes = ExtensionPreferences & {
		
	}

	/** Command: Manage Note Templates */
	export type ManageTemplates = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Search Notes */
	export type SearchNotes = {
		
	}

	/** Command: New Note */
	export type CreateNote = {
		
	}

	/** Command: Move Note to folder */
	export type MoveNote = {
		
	}

	/** Command: View Selected Note */
	export type ViewSelectedNote = {
		
	}

	/** Command: Export Notes */
	export type ExportNotes = {
		
	}

	/** Command: Manage Note Templates */
	export type ManageTemplates = {
		
	}
}