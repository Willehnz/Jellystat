exports.up = async function(knex) {
  try {
    const hasTable = await knex.schema.hasTable('jf_deletion_rules');
    if (!hasTable) {
      await knex.schema.createTable('jf_deletion_rules', function(table) {
        table.increments('ID').primary();
        table.text('library_id').notNullable();
        table.text('rule_name').notNullable();
        table.text('media_type').notNullable(); // movie, show, episode
        table.integer('days_since_watched').notNullable();
        table.boolean('enabled').defaultTo(true);
        table.jsonb('exclusions').defaultTo('{}');
        table.integer('warning_days').defaultTo(3); // Days before deletion to send warning
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        
        // Foreign key to libraries table
        table.foreign('library_id').references('ID').inTable('jf_libraries');
      });
      await knex.raw(`ALTER TABLE jf_deletion_rules OWNER TO "${process.env.POSTGRES_ROLE}";`);
    }
  } catch (error) {
    console.error(error);
  }
};

exports.down = async function(knex) {
  try {
    await knex.schema.dropTableIfExists('jf_deletion_rules');
  } catch (error) {
    console.error(error);
  }
};
