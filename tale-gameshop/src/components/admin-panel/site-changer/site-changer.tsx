import React, {useEffect, useState} from "react";
import container from "../../../inversify.config";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";

type Data = string[];

const SiteChangerPage: React.FC = () => {
    const [images, setImages] = useState<Data>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
                const response = (await apiClient.api.get<Data>('https://localhost:7117/api/Image/list')).data;
                setImages(response);
            } catch (error) {
                console.error('Error getting data:', error);
            }
        })();
    }, []);

    // Удаление изображения
    const handleDelete = (index: any) => {
        setImages(images.filter((_, i) => i !== index));
    };

    // Добавление изображения
    const handleAddImage = (newImage: any) => {
        setImages([...images, newImage]);
        setIsModalOpen(false);
    };

    return (
        <div className="p-8">
            <div className="grid grid-cols-5 gap-4">
                {images.map((image, index) => (
                    <div key={index} className="relative p-2 border rounded shadow bg-white">
                        <img
                            src={`https://localhost:7117${image}`}
                            alt={`Image ${index + 1}`}
                            className="w-full h-32 object-cover rounded"
                        />
                        <button
                            onClick={() => handleDelete(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600"
                        >
                            Удалить
                        </button>
                        <p className="text-center mt-2 text-gray-700">
                            {image.split('_').pop()}
                        </p>
                    </div>
                ))}
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="p-4 border-dashed border-2 border-blue-500 flex items-center justify-center rounded hover:bg-blue-100"
                >
                    Загрузить еще
                </button>
            </div>

            {/* Модальное окно */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded shadow-lg">
                        <h2 className="text-lg font-semibold mb-4">Добавить изображение</h2>
                        <input
                            type="text"
                            placeholder="Введите URL изображения"
                            className="border p-2 w-full rounded mb-4"
                            id="imageInput"
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="mr-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={() =>
                                    // @ts-ignore Существует
                                    handleAddImage(document.getElementById('imageInput').value)
                                }
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                Добавить
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteChangerPage;