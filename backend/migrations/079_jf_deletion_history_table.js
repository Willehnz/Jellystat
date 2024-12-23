exports.up = async function(knex) {
  try {
    const hasTable = await knex.schema.hasTable('jf_deletion_history');
    if (!hasTable) {
      await knex.schema.createTable('jf_deletion_history', function(table) {
        table.increments('ID').primary();
        table.text('item_id').notNullable();
        table.text('library_id').notNullable();
        table.text('rule_id').notNullable();
        table.text('title').notNullable();
        table.text('media_type').notNullable(); // movie, show, episode
        table.timestamp('last_watched').notNullable();
        table.timestamp('deleted_at').defaultTo(knex.fn.now());
        table.jsonb('metadata').defaultTo('{}'); // Store additional metadata about the deleted item
        table.boolean('notified').defaultTo(false);
        table.timestamp('notification_sent').nullable();
        
        // External IDs for integration cleanup
        table.text('sonarr_id').nullable();
        table.text('radarr_id').nullable();
        table.text('jellyseerr_id').nullable();
        
        // Foreign keys
        table.foreign('library_id').references('ID').inTable('jf_libraries');
        table.foreign('rule_id').references('ID').inTable('jf_deletion_rules');
      });
      await knex.raw(`ALTER TABLE jf_deletion_history OWNER TO "${process.env.POSTGRES_ROLE}";`);
    }
  } catch (error) {
    console.error(error);
  }
};

exports.down = async function(knex) {
  try {
    await knex.schema.dropTableIfExists('jf_deletion_history');
  } catch (error) {
    console.error(error);
  }
};
