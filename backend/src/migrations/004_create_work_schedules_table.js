exports.up = function(knex) {
  return knex.schema.createTable('work_schedules', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('schedule_name').notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.json('working_days').notNullable(); // Array of days [1,2,3,4,5] for Mon-Fri
    table.decimal('latitude', 10, 8).nullable(); // Work location latitude
    table.decimal('longitude', 11, 8).nullable(); // Work location longitude
    table.integer('location_radius').defaultTo(100); // Allowed radius in meters
    table.string('location_name').nullable();
    table.boolean('is_active').defaultTo(true);
    table.date('effective_from').nullable();
    table.date('effective_to').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['user_id']);
    table.index(['is_active']);
    table.index(['effective_from', 'effective_to']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('work_schedules');
};
