module.exports = {
  apps: [
    {
      name: 'happyclientele',
      script: 'node',
      args: 'server.cjs',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
