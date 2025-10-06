exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('employee_id').unique().notNullable();
    table.string('email').unique().notNullable();
    table.string('password_hash').notNullable();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.string('department').notNullable();
    table.string('position').notNullable();
    table.string('phone').nullable();
    table.enum('role', ['employee', 'admin', 'super_admin']).defaultTo('employee');
    table.enum('status', ['active', 'inactive', 'suspended']).defaultTo('active');
    table.boolean('is_verified').defaultTo(false);
    table.timestamp('last_login').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['employee_id']);
    table.index(['email']);
    table.index(['department']);
    table.index(['status']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
