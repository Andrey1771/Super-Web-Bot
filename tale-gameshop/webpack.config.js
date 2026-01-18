import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
// Получаем полный путь к `node_modules`
const __dirname = path.dirname(__filename);

export default (env, { mode }) => ({
    mode: mode === 'production' ? 'production' : 'development',
    cache: mode === 'production'
        ? false
        : {
            type: 'filesystem',
            buildDependencies: {
                config: [__filename],
            },
        },
    experiments: mode === 'production'
        ? undefined
        : {
            lazyCompilation: true,
        },
    infrastructureLogging: {
        level: 'warn',
    },
    stats: 'errors-warnings',
    optimization: {
        minimize: mode === 'production',
        moduleIds: mode === 'production' ? 'deterministic' : 'named',
        chunkIds: mode === 'production' ? 'deterministic' : 'named',
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
        hot: true,
        devMiddleware: {
            writeToDisk: false,
        },
        client: {
            overlay: {
                errors: true,
                warnings: false,
            },
            webSocketURL: {
                protocol: 'wss',
                hostname: 'localhost',
                port: 3000,
                pathname: '/ws',
            },
        },
        server: {
            type: 'https',
            options: {
                key: fs.readFileSync('./certs/localhost-key.pem'),
                cert: fs.readFileSync('./certs/localhost.pem'),
                requestCert: false,
            },
        },
    },
    devtool: (mode === 'production') ? 'source-map' : 'eval-cheap-module-source-map',
});
