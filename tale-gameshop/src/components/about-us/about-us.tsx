import React from "react";
import './about-us.css'
import bestGamingPlatform from "../../assets/images/best-gaming-platform.jpg"
import oneMillionUsers from "../../assets/images/one-million-users.jpg"
import virtual from "../../assets/images/virtual.jpg"

export default function AboutUs() {
    return (
        <div className="bg-gray-100 p-8">
            <div className="container mx-auto">
                <h1 className="text-3xl font-bold text-center mb-4">About Us</h1>
                <p className="text-center mb-8">Welcome to our gaming paradise! We are dedicated to connecting gamers
                    with
                    the titles they love, making every gaming experience unforgettable.</p>

                <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-2">Our Mission</h2>
                    <p>Our mission is to provide a vast selection of computer games tailored to your interests. We
                        believe in fostering a vibrant community where gamers can discover, connect, and thrive.</p>
                </div>

                <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-2">Our Vision</h2>
                    <p>At our core, we strive to revolutionize the gaming experience by offering an extensive catalogue
                        of titles that cater to every player's taste. Join us in our journey to create the ultimate
                        gaming experience.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="bg-white p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-bold mb-2">Our History</h3>
                        <p>Founded in 2020, we have quickly grown to become a leading platform for gamers worldwide. Our
                            commitment to quality and community has been the cornerstone of our success.</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-bold mb-2">Our Team</h3>
                        <p>Our team is composed of passionate gamers and industry experts who are dedicated to bringing
                            you the best gaming experience possible. We work tirelessly to ensure our platform is always
                            evolving and improving.</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-bold mb-2">Our Values</h3>
                        <p>We believe in inclusivity, innovation, and integrity. These values guide everything we do,
                            from the games we offer to the way we interact with our community.</p>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-bold mb-2">Our Future</h3>
                        <p>Looking ahead, we are excited to continue expanding our offerings and reaching new heights.
                            We are committed to staying at the forefront of the gaming industry and providing our users
                            with unparalleled experiences.</p>
                    </div>
                </div>


                <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Our Journey</h2>
                    <div className="relative">
                        <div
                            className="border-l-2 border-gray-300 absolute h-full left-1/2 transform -translate-x-1/2"></div>
                        <div className="space-y-8">
                            <div className="flex items-center w-full">
                                <div className="w-1/2 pr-8">
                                    <div className="bg-white p-4 rounded-lg shadow-lg">
                                        <h3 className="text-lg font-bold mb-2">2020</h3>
                                        <p>Our platform was founded with the vision to connect gamers worldwide.</p>
                                    </div>
                                </div>
                                <div className="w-1/2"></div>
                            </div>
                            <div className="flex items-center w-full">
                                <div className="w-1/2"></div>
                                <div className="w-1/2 pl-8">
                                    <div className="bg-white p-4 rounded-lg shadow-lg">
                                        <h3 className="text-lg font-bold mb-2">2021</h3>
                                        <p>We launched our first major update, introducing new features and games.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center w-full">
                                <div className="w-1/2 pr-8">
                                    <div className="bg-white p-4 rounded-lg shadow-lg">
                                        <h3 className="text-lg font-bold mb-2">2022</h3>
                                        <p>Our community grew to over 1 million users, marking a significant
                                            milestone.</p>
                                    </div>
                                </div>
                                <div className="w-1/2"></div>
                            </div>
                            <div className="flex items-center w-full">
                                <div className="w-1/2"></div>
                                <div className="w-1/2 pl-8">
                                    <div className="bg-white p-4 rounded-lg shadow-lg">
                                        <h3 className="text-lg font-bold mb-2">2023</h3>
                                        <p>We expanded our platform to include virtual reality gaming experiences.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>


                <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Our Achievements</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
                            <img src={bestGamingPlatform} alt="Award Icon" className="mx-auto mb-4 about-us-awards-image"/>
                            <h3 className="text-xl font-bold mb-2">Best Gaming Platform 2021</h3>
                            <p>Recognized as the best gaming platform by the Global Gaming Awards.</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
                            <img src={oneMillionUsers} alt="Community Icon" className="mx-auto mb-4 about-us-awards-image"/>
                            <h3 className="text-xl font-bold mb-2">1 Million Users</h3>
                            <p>Our community reached a milestone of 1 million active users in 2022.</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
                            <img src={virtual} alt="Innovation Icon" className="mx-auto mb-4 about-us-awards-image"/>
                            <h3 className="text-xl font-bold mb-2">Innovation in VR</h3>
                            <p>Leading the way in virtual reality gaming experiences since 2023.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}