// webpack.config.js
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/scripts/background.ts',
  output: {
    filename: 'background.js',
    path: path.resolve(__dirname, 'build', 'scripts'),
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { 
          from: 'data/*.json',
          to: '../data/[name][ext]'
        },
      ],
    }),
  ],
};
