exports.up = async function(knex) {
  try {
    const hasColumn = await knex.schema.hasColumn('app_config', 'external_services');
    if (!hasColumn) {
      await knex.schema.table('app_config', function(table) {
        table.jsonb('external_services').defaultTo(JSON.stringify({
          discord: {
            enabled: false,
            webhook_url: '',
            notification_types: ['deletion_warning', 'deletion_complete'],
            mention_role_id: ''
          },
          sonarr: {
            enabled: false,
            url: '',
            api_key: '',
            delete_files: true
          },
          radarr: {
            enabled: false,
            url: '',
            api_key: '',
            delete_files: true
          },
          jellyseerr: {
            enabled: false,
            url: '',
            api_key: '',
            remove_requests: true
          }
        }));
      });
    }
  } catch (error) {
    console.error(error);
  }
};

exports.down = async function(knex) {
  try {
    const hasColumn = await knex.schema.hasColumn('app_config', 'external_services');
    if (hasColumn) {
      await knex.schema.table('app_config', function(table) {
        table.dropColumn('external_services');
      });
    }
  } catch (error) {
    console.error(error);
  }
};
