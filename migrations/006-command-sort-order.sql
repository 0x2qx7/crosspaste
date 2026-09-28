-- CrossPaste: Add sort_order to custom_commands for drag & drop reordering.

ALTER TABLE custom_commands ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialise sort_order for existing rows based on their id (lower id = higher sort_order number = bottom).
UPDATE custom_commands SET sort_order = id;
