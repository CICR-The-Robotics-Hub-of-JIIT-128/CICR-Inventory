require('dotenv').config({ path: '../.env' });

module.exports = [
  {
    id: '1',
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
    role: 'ADMIN'
  },
  {
    id: '2',
    username: process.env.MANAGER_USERNAME,
    password: process.env.MANAGER_PASSWORD,
    role: 'MANAGER'
  },
  // CICR Club Members
  {
    id: '3',
    username: process.env.TANISHKA_USERNAME || 'tanishka',
    password: process.env.TANISHKA_PASSWORD || '1234',
    role: 'VIEWER'
  },
  {
    id: '4',
    username: process.env.ARYAN_USERNAME || 'aryan',
    password: process.env.ARYAN_PASSWORD || '4321',
    role: 'VIEWER'
  },
  {
    id: '5',
    username: process.env.ANANYA_USERNAME || 'ananya',
    password: process.env.ANANYA_PASSWORD || '2468',
    role: 'VIEWER'
  },
  {
    id: '6',
    username: process.env.AJITESH_USERNAME || 'ajitesh',
    password: process.env.AJITESH_PASSWORD || '1357',
    role: 'VIEWER'
  },
  {
    id: '7',
    username: process.env.TARUSH_USERNAME || 'tarush',
    password: process.env.TARUSH_PASSWORD || '9876',
    role: 'VIEWER'
  },
  {
    id: '8',
    username: process.env.ANKIT_USERNAME || 'ankit',
    password: process.env.ANKIT_PASSWORD || '5678',
    role: 'VIEWER'
  },
  {
    id: '9',
    username: process.env.UPMANYU_USERNAME || 'upmanyu',
    password: process.env.UPMANYU_PASSWORD || '3456',
    role: 'VIEWER'
  },
  {
    id: '10',
    username: process.env.PRIYANSH_USERNAME || 'priyansh',
    password: process.env.PRIYANSH_PASSWORD || '7890',
    role: 'VIEWER'
  },
  {
    id: '11',
    username: process.env.JITESH_USERNAME || 'jitesh',
    password: process.env.JITESH_PASSWORD || '2580',
    role: 'VIEWER'
  },
  {
    id: '12',
    username: process.env.ASHU_USERNAME || 'ashu',
    password: process.env.ASHU_PASSWORD || '1470',
    role: 'VIEWER'
  },
  {
    id: '13',
    username: process.env.AASHVI_USERNAME || 'aashvi',
    password: process.env.AASHVI_PASSWORD || '3690',
    role: 'VIEWER'
  },
  {
    id: '14',
    username: process.env.SAUMYA_USERNAME || 'saumya',
    password: process.env.SAUMYA_PASSWORD || '1598',
    role: 'VIEWER'
  },
  {
    id: '15',
    username: process.env.DHRUVI_USERNAME || 'dhruvi',
    password: process.env.DHRUVI_PASSWORD || '7531',
    role: 'VIEWER'
  },
  {
    id: '16',
    username: process.env.ASHUTOSH_USERNAME || 'ashutosh',
    password: process.env.ASHUTOSH_PASSWORD || '9512',
    role: 'VIEWER'
  },
  {
    id: '17',
    username: process.env.ARYANM_USERNAME || 'aryanm',
    password: process.env.ARYANM_PASSWORD || '8520',
    role: 'VIEWER'
  },
  {
    id: '18',
    username: process.env.YASHARTH_USERNAME || 'yasharth',
    password: process.env.YASHARTH_PASSWORD || '6543',
    role: 'ADMIN'
  },
  {
    id: '19',
    username: process.env.SARTHAK_USERNAME || 'sarthak',
    password: process.env.SARTHAK_PASSWORD || '2468',
    role: 'VIEWER'
  },
  {
    id: '20',
    username: process.env.SHIVAM_USERNAME || 'shivam',
    password: process.env.SHIVAM_PASSWORD || '1357',
    role: 'VIEWER'
  }
];