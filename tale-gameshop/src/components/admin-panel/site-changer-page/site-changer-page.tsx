import React, {useEffect, useState} from "react";
import container from "../../../inversify.config";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import {IUrlService} from "../../../iterfaces/i-url-service";
import PageHeader from "../../layout/PageHeader";
import Card from "../../ui/Card";
import ModalConfirm from "../../ui/ModalConfirm";
import EmptyState from "../../ui/EmptyState";
import { useToast } from "../../ui/ToastProvider";

type Data = string[];

const SiteChangerPage: React.FC = () => {
    const [images, setImages] = useState<Data>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
    const [file, setFile] = useState(null);
    const { addToast } = useToast();


    const urlService = container.get<IUrlService>(IDENTIFIERS.IUrlService);

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
    const handleDelete = async () => {
        if (pendingDeleteIndex === null) {
            return;
        }
        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const fileName = images.at(pendingDeleteIndex)?.split('/')?.pop() ?? "";
            await apiClient.api.delete(`/api/Image/delete?fileName=${encodeURIComponent(fileName)}`);
            addToast("Image deleted", "success");
        } catch (error) {
            console.error('Error getting data:', error);
            addToast("Failed to delete image", "error");
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
            addToast("Image uploaded", "success");
        } catch (error) {
            console.error(error);
            alert("Error load file");
        }
        finally {
            await updateImages();
        }
    };


    return (
        <div className="admin-grid">
            <PageHeader
                title="Media manager"
                description="Upload, review, and clean up assets used across the storefront."
                breadcrumbs={["System", "Media"]}
                primaryAction={
                    <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                        Upload image
                    </button>
                }
            />

            <Card>
                {images.length === 0 ? (
                    <EmptyState
                        title="No media yet"
                        description="Upload the first image to get started."
                        action={
                            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                                Upload first image
                            </button>
                        }
                    />
                ) : (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                        {images.map((image, index) => (
                            <div key={index} className="relative p-2 border rounded shadow bg-white">
                                <img
                                    src={`${urlService.apiBaseUrl}${image}`}
                                    alt={`Image ${index + 1}`}
                                    className="w-full h-32 object-cover rounded"
                                />
                                <button
                                    onClick={() => {
                                        setPendingDeleteIndex(index);
                                        setIsDeleteOpen(true);
                                    }}
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
                            className="upload-dropzone"
                        >
                            Загрузить еще
                        </button>
                    </div>
                )}
            </Card>

            {/* Модальное окно */}
            {isModalOpen && (
                <div className="admin-modal">
                    <div className="admin-modal__card">
                        <h2 className="text-lg font-semibold mb-4">Add image</h2>
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className="mb-4"
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="mr-4 btn btn-outline"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                className="btn btn-primary"
                            >
                                Load
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ModalConfirm
                isOpen={isDeleteOpen}
                title="Удалить изображение?"
                description="Это действие необратимо."
                confirmLabel="Delete"
                onConfirm={async () => {
                    await handleDelete();
                    setIsDeleteOpen(false);
                    setPendingDeleteIndex(null);
                }}
                onCancel={() => {
                    setIsDeleteOpen(false);
                    setPendingDeleteIndex(null);
                }}
            />
        </div>
    );
};

export default SiteChangerPage;
