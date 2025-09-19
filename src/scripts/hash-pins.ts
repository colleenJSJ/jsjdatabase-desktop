import bcrypt from 'bcryptjs';

// This script generates bcrypt hashes for PINs
// Run with: npx tsx src/scripts/hash-pins.ts

const users = [
  { name: 'John Johnson', pin: '12345' },
  { name: 'Susan Johnson', pin: '23456' },
  { name: 'Kate Johnson', pin: '34567' },
  { name: 'Colleen Johnson', pin: '45678' },
];

async function hashPins() {

  for (const user of users) {
    const hash = await bcrypt.hash(user.pin, 10);

  }

}

hashPins();