const io = require('socket.io-client');

// Test room management functionality
async function testRoomManagement() {
  console.log('Testing Room Management...\n');

  // Create multiple socket connections
  const socket1 = io('http://localhost:3000');
  const socket2 = io('http://localhost:3000');
  const socket3 = io('http://localhost:3000');

  // Wait for connections
  await Promise.all([
    new Promise(resolve => socket1.on('connect', resolve)),
    new Promise(resolve => socket2.on('connect', resolve)),
    new Promise(resolve => socket3.on('connect', resolve))
  ]);

  console.log('✓ All sockets connected\n');

  // Set up event listeners
  socket1.on('join-room-success', (data) => {
    console.log('Socket 1 joined room:', data);
  });

  socket1.on('participant-joined', (data) => {
    console.log('Socket 1 received participant-joined:', data);
  });

  socket2.on('join-room-success', (data) => {
    console.log('Socket 2 joined room:', data);
  });

  socket3.on('join-room-error', (data) => {
    console.log('Socket 3 join error:', data);
  });

  // Test joining room
  console.log('Testing room join...');
  socket1.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });
  
  await new Promise(resolve => setTimeout(resolve, 100));

  socket2.emit('join-room', { roomId: 'test-room', participantId: 'user-2' });

  await new Promise(resolve => setTimeout(resolve, 100));

  // Test duplicate participant
  console.log('\nTesting duplicate participant...');
  socket3.emit('join-room', { roomId: 'test-room', participantId: 'user-1' });

  await new Promise(resolve => setTimeout(resolve, 100));

  // Test leaving room
  console.log('\nTesting room leave...');
  socket1.on('leave-room-success', () => {
    console.log('Socket 1 left room successfully');
  });

  socket2.on('participant-left', (data) => {
    console.log('Socket 2 received participant-left:', data);
  });

  socket1.emit('leave-room', { roomId: 'test-room', participantId: 'user-1' });

  await new Promise(resolve => setTimeout(resolve, 100));

  // Cleanup
  socket1.disconnect();
  socket2.disconnect();
  socket3.disconnect();

  console.log('\n✓ Test completed!');
  process.exit(0);
}

// Run test
testRoomManagement().catch(console.error);