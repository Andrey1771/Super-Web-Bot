import React, {useEffect, useState} from "react";
import container from "../../../inversify.config";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import webSettings from '../../../webSettings.json';

type Data = string[];

const SiteChangerPage: React.FC = () => {
    const [images, setImages] = useState<Data>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [file, setFile] = useState(null);


    useEffect(() => {
        (async () => {
            try {
                await updateImages();
            } catch (error) {
                console.error('Error getting data:', error);
            }
        })();
    }, []);


    const updateImages = async () => {
        const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
        const response = (await apiClient.api.get<Data>('/api/Image/list')).data;
        setImages(response);
    }

    // Удаление изображения
    const handleDelete = async (index: any) => {
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const fileName = images.at(index)?.split('/')?.pop() ?? "";
            await apiClient.api.delete(`/api/Image/delete?fileName=${encodeURIComponent(fileName)}`);
        } catch (error) {
            console.error('Error getting data:', error);
        }
        finally {
            await updateImages();
        }
    };

    // Обработчик выбора файла
    const handleFileChange = (e: any) => {
        setFile(e.target.files[0]);
    };

    // Загрузка файла на сервер
    const handleUpload = async () => {
        if (!file) {
            alert("Chose file before download");
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.post("/api/Image/upload", formData, {
                headers: {
                    "Content-Type": "multipart/form-data"
                },
            });

            setImages([...images, response.data.filePath]); // Добавляем новый путь к изображениям
            setIsModalOpen(false);
            setFile(null); // Сброс файла после загрузки
        } catch (error) {
            console.error(error);
            alert("Error load file");
        }
        finally {
            await updateImages();
        }
    };


    return (
        <div className="p-8">
            <div className="grid grid-cols-5 gap-4">
                {images.map((image, index) => (
                    <div key={index} className="relative p-2 border rounded shadow bg-white">
                        <img
                            src={`${webSettings.apiBaseUrl}${image}`}
                            alt={`Image ${index + 1}`}
                            className="w-full h-32 object-fill rounded"
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
                        <h2 className="text-lg font-semibold mb-4">Add image</h2>
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className="mb-4"
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="mr-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                                Load
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SiteChangerPage;