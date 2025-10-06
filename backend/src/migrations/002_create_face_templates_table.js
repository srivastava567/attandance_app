exports.up = function(knex) {
  return knex.schema.createTable('face_templates', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.text('face_encoding').notNullable(); // Encrypted face template
    table.string('face_hash').notNullable(); // Hash for quick comparison
    table.json('face_metadata').nullable(); // Additional face data
    table.integer('quality_score').nullable(); // Face quality score
    table.boolean('is_primary').defaultTo(false); // Primary template for user
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['user_id']);
    table.index(['face_hash']);
    table.index(['is_primary']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('face_templates');
};
