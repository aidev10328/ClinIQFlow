const { Client } = require('pg');

async function seedProducts() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:10328%24Sheetal@db.funhagjrsaikcbirncjf.supabase.co:5432/postgres';

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();

    // Check if products exist
    const existing = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(existing.rows[0].count) > 0) {
      console.log('Products already exist, skipping seed');

      // Show existing products
      const products = await client.query('SELECT code, name FROM products ORDER BY code');
      console.log('\nExisting products:');
      products.rows.forEach(row => console.log('  -', row.code, '-', row.name));
      return;
    }

    console.log('Seeding products...');

    // Insert products
    await client.query(`
      INSERT INTO products (code, name, description, features, is_active, sort_order) VALUES
      ('APPOINTMENTS', 'Appointments', 'Appointment scheduling and management',
       '["Online booking", "Calendar integration", "Reminders", "Waitlist management"]'::jsonb, true, 1),
      ('CLINIQ_BRIEF', 'CliniqBrief', 'AI-powered clinical documentation',
       '["Voice-to-text", "SOAP notes", "ICD-10 coding suggestions", "EHR integration"]'::jsonb, true, 2)
      ON CONFLICT (code) DO NOTHING
    `);

    // Get product IDs
    const products = await client.query('SELECT id, code FROM products');
    const productMap = {};
    products.rows.forEach(p => productMap[p.code] = p.id);

    console.log('Products created:', Object.keys(productMap));

    // Insert pricing
    await client.query(`
      INSERT INTO product_pricing (product_id, region, currency, price_per_doctor_monthly, is_active) VALUES
      ($1, 'US', 'USD', 30.00, true),
      ($1, 'UK', 'GBP', 25.00, true),
      ($1, 'IN', 'INR', 999.00, true),
      ($2, 'US', 'USD', 20.00, true),
      ($2, 'UK', 'GBP', 15.00, true),
      ($2, 'IN', 'INR', 699.00, true)
      ON CONFLICT DO NOTHING
    `, [productMap['APPOINTMENTS'], productMap['CLINIQ_BRIEF']]);

    console.log('Pricing created');

    // Insert discount codes
    await client.query(`
      INSERT INTO discount_codes (code, type, value, description, is_active, max_uses) VALUES
      ('LAUNCH30', 'PERCENTAGE', 30, 'Launch discount - 30% off', true, 100),
      ('FREETRIAL', 'PERCENTAGE', 100, 'Free first month', true, 50),
      ('INDIA500', 'FIXED', 500, '₹500 off for India', true, NULL)
      ON CONFLICT (code) DO NOTHING
    `);

    console.log('Discount codes created');

    // Verify
    const finalProducts = await client.query(`
      SELECT p.code, p.name, pp.region, pp.currency, pp.price_per_doctor_monthly
      FROM products p
      LEFT JOIN product_pricing pp ON p.id = pp.product_id
      ORDER BY p.code, pp.region
    `);

    console.log('\nSeeded products and pricing:');
    finalProducts.rows.forEach(row =>
      console.log(`  ${row.code} - ${row.region}: ${row.currency} ${row.price_per_doctor_monthly}`)
    );

    console.log('\nSeed completed successfully!');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedProducts();
