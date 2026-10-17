const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
  mode: "none",
  entry: "./src/app.js",
  output: {
    path: path.join(__dirname, "dist"),
    filename: "bundle.js",
    clean: true, // remove stale files from dist
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    port: 8080, // Frontend dev server port
    hot: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.svg$/,
        use: ["raw-loader"],
      },
    ],
  },
  devtool: "source-map",
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "public/index.html"),
      inject: true,
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: "public/data", to: "data" }],
    }),
  ],
};
