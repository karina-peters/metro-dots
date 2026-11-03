const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const path = require("path");

module.exports = {
  mode: "none",
  entry: "./src/app.ts",
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
  resolve: {
    extensions: [".ts", ".js", ".css", ".json"],
    plugins: [new TsconfigPathsPlugin({ configFile: "./tsconfig.json" })],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.[jt]s$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-typescript"],
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
    new webpack.DefinePlugin({
      "process.env": JSON.stringify(process.env),
    }),
  ],
};
