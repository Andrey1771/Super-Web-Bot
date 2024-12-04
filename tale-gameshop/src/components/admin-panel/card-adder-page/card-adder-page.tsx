import React, { useState, useEffect } from 'react';
import axios from 'axios';
import container from "../../../inversify.config";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";

const gameTypes = {
    0: "Action",
    1: "Adventure",
    2: "Role-Playing Games",
    3: "Simulation",
    4: "Strategy",
    5: "Puzzle",
    6: "Sports",
    7: "Card and Board Games",
    8: "Massively Multiplayer Online",
    9: "Horror",
    10: "Casual Games",
    11: "Educational Games",
};

const CardAdderPage: React.FC = () => {
    const [items, setItems] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [mode, setMode] = useState<'add' | 'edit'>('edit');
    const [form, setForm] = useState({
        id: '',
        name: '',
        price: 0,
        description: '',
        title: '',
        gameType: 0,
        imagePath: '',
        releaseDate: '',
    });
    const [file, setFile] = useState<File | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        fetchItems(page, true);
    }, [page]);

    const fetchItems = async (page: number, reset: boolean = false) => {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.get(`https://localhost:7117/api/game?page=${page}&limit=20`);
            const newItems = response.data;

            setItems((prev) => (reset ? newItems : [...prev, ...newItems]));

            if (newItems.length < 20) {
                setHasMore(false); // Больше страниц нет
            }
        } catch (error) {
            console.error('Ошибка загрузки объектов:', error);
        }
    };

    const handleSelect = (item: any) => {
        setSelectedItem(item);
        setForm({
            id: item.id || '',
            name: item.name || '',
            price: item.price || 0,
            description: item.description || '',
            title: item.title || '',
            gameType: item.gameType || 0,
            imagePath: item.imagePath || '',
            releaseDate: item.releaseDate ? item.releaseDate.split('T')[0] : '',
        });
        setMode('edit');
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: name === 'price' || name === 'gameType' ? (value === '' ? '' : Number(value)) : value,
        }));
    };

    const handleChangeSelect = (e: any) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && gameTypes.hasOwnProperty(value)) {
            setForm({...form, gameType: value});
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
                setFile(e.target.files[0]);
        }
    };

    const uploadImage = async () => {
        if (!file) return form.imagePath;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.post('https://localhost:7117/api/image/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return getFilePath(response.data.filePath);
        } catch (error) {
            console.error('Ошибка загрузки изображения:', error);
            return form.imagePath;
        }
    };

    const getFilePath = (fullPath: string) => {
        // Извлекаем только имя файла
        const fileName = fullPath.split('\\').pop();
        // Добавляем путь wwwroot\uploads\
        const newPath = `wwwroot\\uploads\\${fileName}`;
        return newPath;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const imagePath = await uploadImage();

        const updatedItem = {
            ...form,
            price: form.price ? Number(form.price) : 0,
            gameType: form.gameType ? Number(form.gameType) : 0,
            imagePath,
        };

        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            if (mode === 'edit') {
                await apiClient.api.put(`https://localhost:7117/api/game/${selectedItem.id}`, updatedItem);
            } else {
                await apiClient.api.post('https://localhost:7117/api/game', updatedItem);
            }
            setPage(1);
            setHasMore(true);
            setItems([]);
            await fetchItems(1, true);
            resetForm();
        } catch (error) {
            console.error('Ошибка сохранения объекта:', error);
        }
    };

    const resetForm = () => {
        setSelectedItem(null);
        setForm({
            id: '',
            name: '',
            price: 0,
            description: '',
            title: '',
            gameType: 0,
            imagePath: '',
            releaseDate: '',
        });
        setFile(null);
        setMode('edit');
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollTop + clientHeight >= scrollHeight - 10 && hasMore) {
            setPage((prev) => prev + 1);
        }
    };


    return (
        <div className="p-8">
            <div className="flex justify-between mb-4">
                <h1 className="text-2xl font-bold">
                    {mode === 'edit' ? 'Выберите объект для редактирования' : 'Добавление нового объекта'}
                </h1>
                <button
                    onClick={() => {
                        resetForm();
                        setMode(mode === 'edit' ? 'add' : 'edit');
                    }}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                    {mode === 'edit' ? 'Добавить новый объект' : 'Перейти к редактированию'}
                </button>
            </div>

            {mode === 'edit' && (
                <div className="overflow-y-auto h-64 border p-4" onScroll={handleScroll}>
                    <ul>
                        {items.map((item: any) => (
                            <li
                                key={item._id}
                                onClick={() => handleSelect(item)}
                                className={`p-2 cursor-pointer rounded ${
                                    selectedItem?._id === item._id ? 'bg-blue-100' : 'hover:bg-gray-100'
                                }`}
                            >
                                {item.name}
                            </li>
                        ))}
                    </ul>
                    {!hasMore && <p className="text-center mt-4">Больше объектов нет.</p>}
                </div>
            )}

            {(mode === 'add' || selectedItem) && (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        name="name"
                        placeholder="Name"
                        value={form.name}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                    <input
                        type="number"
                        name="price"
                        placeholder="Price"
                        value={form.price}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                    <textarea
                        name="description"
                        placeholder="Description"
                        value={form.description}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    ></textarea>
                    <input
                        type="text"
                        name="title"
                        placeholder="Title"
                        value={form.title}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                    <div className="w-full">
                        {/* Выпадающий список */}
                        <select
                            name="gameType"
                            value={form.gameType}
                            onChange={handleChangeSelect}
                            className="w-full p-2 border rounded"
                        >
                            {Object.entries(gameTypes).map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <input
                        type="date"
                        name="releaseDate"
                        value={form.releaseDate.split('T')[0]}
                        onChange={handleChange}
                        className="w-full p-2 border rounded"
                    />
                    <input type="file" onChange={handleFileChange} className="w-full p-2 border rounded"/>
                    <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                        {mode === 'edit' ? 'Сохранить изменения' : 'Добавить объект'}
                    </button>
                </form>
            )}
        </div>
    );
};

export default CardAdderPage;
