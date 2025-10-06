exports.up = function(knex) {
  return knex.schema.createTable('attendance_records', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.enum('type', ['check_in', 'check_out']).notNullable();
    table.timestamp('timestamp').notNullable();
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();
    table.string('location_address').nullable();
    table.decimal('accuracy', 8, 2).nullable(); // GPS accuracy in meters
    table.text('face_image_path').nullable(); // Path to captured face image
    table.decimal('confidence_score', 5, 4).nullable(); // Face recognition confidence
    table.boolean('liveness_passed').defaultTo(false);
    table.json('liveness_data').nullable(); // Liveness detection results
    table.enum('status', ['pending', 'approved', 'rejected', 'flagged']).defaultTo('pending');
    table.text('rejection_reason').nullable();
    table.uuid('approved_by').nullable().references('id').inTable('users');
    table.timestamp('approved_at').nullable();
    table.boolean('is_offline').defaultTo(false);
    table.timestamp('synced_at').nullable();
    table.json('device_info').nullable(); // Device metadata
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['user_id']);
    table.index(['timestamp']);
    table.index(['type']);
    table.index(['status']);
    table.index(['is_offline']);
    table.index(['synced_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('attendance_records');
};
