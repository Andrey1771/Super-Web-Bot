import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

// Получаем полный путь к `node_modules`
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = path.resolve(__dirname, 'node_modules');

export default (env, { mode }) => ({
    mode: mode === 'production' ? 'production' : 'development',
    optimization: {
        minimize: mode === 'production',
    },
    entry: './src/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: (mode === 'production') ? 'bundle.[contenthash].js' : 'bundle.js',
        publicPath: '/',
        assetModuleFilename: 'images/[hash][ext][query]',
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        fallback: {
            "crypto": path.resolve(nodeModules, "crypto-browserify"),
            "stream": path.resolve(nodeModules, "stream-browserify"),
            "buffer": path.resolve(nodeModules, "buffer"),
            "vm": path.resolve(nodeModules, "vm-browserify"),
            "process": path.resolve(nodeModules, "process"),
            "util": path.resolve(nodeModules, "util")
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [],
                            plugins: [],
                        },
                    },
                    {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true,
                            experimentalWatchApi: true,
                        },
                    },
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: [
                    (mode === 'production') ? MiniCssExtractPlugin.loader : 'style-loader',
                    'css-loader',
                    'postcss-loader',
                ],
            },
            {
                test: /\.json$/,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/resources/[name].[contenthash].json',
                }
            },
            {
                test: /\.html$/,
                use: [
                    {
                        loader: 'html-loader',
                        options: {
                            sources: false,
                            minimize: (mode === 'production'),
                        },
                    },
                ],
            },
            {
                test: /\.(png|jpe?g|gif|svg|ico|webp|jpg)$/i,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            regExp: /\/([a-z0-9]+)\/[a-z0-9]+\.png$/i,
                            name: 'assets/images/[name].[contenthash].[ext]',
                        },
                    },
                ],
            }
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            favicon: './public/favicon.svg',
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public/silent-check-sso.html', to: '' },
            ],
        }),
        new webpack.ProvidePlugin({
            Buffer: ["buffer", "Buffer"],
            process: "process"
        }),
        ...((mode === 'production')
            ? [
                new MiniCssExtractPlugin({
                    filename: 'styles.[contenthash].css',
                }),
            ]
            : []),
    ],
    devServer: {
        historyApiFallback: true,
        compress: false,
        port: 3000,
        server: {
            type: 'https',
            options: {
                key: fs.readFileSync('./public/private.key'),
                cert: fs.readFileSync('./public/private.crt'),
                passphrase: 'webpack-dev-server',
                requestCert: false,
            },
        },
    },
    devtool: (mode === 'production') ? 'source-map' : 'cheap-module-source-map',
});
