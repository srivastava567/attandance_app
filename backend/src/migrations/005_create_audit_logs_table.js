exports.up = function(knex) {
  return knex.schema.createTable('audit_logs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable().references('id').inTable('users');
    table.string('action').notNullable(); // login, logout, attendance_mark, etc.
    table.string('resource_type').nullable(); // user, attendance, face_template, etc.
    table.uuid('resource_id').nullable();
    table.json('old_values').nullable();
    table.json('new_values').nullable();
    table.string('ip_address').nullable();
    table.string('user_agent').nullable();
    table.string('device_id').nullable();
    table.enum('severity', ['low', 'medium', 'high', 'critical']).defaultTo('low');
    table.text('description').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['user_id']);
    table.index(['action']);
    table.index(['resource_type', 'resource_id']);
    table.index(['severity']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('audit_logs');
};
