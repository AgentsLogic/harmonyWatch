/**
 * @deprecated This video page is deprecated. Videos are now displayed in a modal.
 * This file is kept for backward compatibility but should not be used.
 * Use the VideoModal component instead.
 */

"use client";

import { useState } from "react";
import VideoPlayer from "../components/video-player";
import VideoDetails from "../components/video-details";
import CommentsSection from "../components/comments-section";
import EpisodeSidebar from "../components/episode-sidebar";
import MoreEpisodes from "../components/more-episodes";

// Dummy data for the video page
const currentVideo = {
  id: "tree-of-scetis",
  title: "The Tree of Scetis",
  series: "CYBERNAUTS",
  season: 1,
  episode: 2,
  duration: "22:03",
  currentTime: "1:45",
  rating: 5,
  description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat",
  videoUrl: "/dummy-videos/preview-dummy.webm",
  thumbnail: "/images/content-1.png"
};

const episodes = [
  {
    id: 1,
    title: "The Tree of Scetic",
    series: "DUST TO DUST",
    season: 1,
    episode: 1,
    duration: "21:19",
    thumbnail: "/images/content-1.png",
    isCurrent: true
  },
  {
    id: 2,
    title: "Lamentation of the Wind",
    series: "DUST TO DUST",
    season: 1,
    episode: 2,
    duration: "22:03",
    thumbnail: "/images/content-2.png",
    isCurrent: false
  },
  {
    id: 3,
    title: "Lamentation of the Wind",
    series: "DUST TO DUST",
    season: 1,
    episode: 3,
    duration: "20:45",
    thumbnail: "/images/content-3.png",
    isCurrent: false
  }
];

const moreEpisodes = [
  {
    id: 4,
    title: "The Desert Fathers",
    series: "DUST TO DUST",
    season: 1,
    episode: 4,
    duration: "19:32",
    thumbnail: "/images/content-1.png",
    isCurrent: false
  },
  {
    id: 5,
    title: "The Hermit's Journey",
    series: "DUST TO DUST",
    season: 1,
    episode: 5,
    duration: "23:15",
    thumbnail: "/images/content-2.png",
    isCurrent: false
  },
  {
    id: 6,
    title: "The Sacred Texts",
    series: "DUST TO DUST",
    season: 1,
    episode: 6,
    duration: "21:48",
    thumbnail: "/images/content-3.png",
    isCurrent: false
  },
  {
    id: 7,
    title: "The Monastery",
    series: "DUST TO DUST",
    season: 1,
    episode: 7,
    duration: "20:12",
    thumbnail: "/images/content-1.png",
    isCurrent: false
  },
  {
    id: 8,
    title: "The Final Prayer",
    series: "DUST TO DUST",
    season: 1,
    episode: 8,
    duration: "24:06",
    thumbnail: "/images/content-2.png",
    isCurrent: false
  }
];

export default function VideoPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState("1:45");
  const [selectedSeason, setSelectedSeason] = useState(1);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <div className="pt-24">
        <div className="mx-auto max-w-[1700px] px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Main Content - Left Side */}
            <div className="lg:col-span-3">
              {/* Video Player */}
              <VideoPlayer 
                video={currentVideo}
                isPlaying={isPlaying}
                onPlayPause={setIsPlaying}
                currentTime={currentTime}
                onTimeUpdate={setCurrentTime}
              />
              
              {/* Video Details */}
              <VideoDetails video={currentVideo} />
              
              {/* Comments Section */}
              <CommentsSection contentId={currentVideo.id} />
            </div>
            
            {/* Episode Sidebar - Right Side */}
            <div className="lg:col-span-1">
              <EpisodeSidebar 
                episodes={episodes}
                selectedSeason={selectedSeason}
                onSeasonChange={setSelectedSeason}
              />
              
              {/* More Episodes Section */}
              <MoreEpisodes episodes={moreEpisodes} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
