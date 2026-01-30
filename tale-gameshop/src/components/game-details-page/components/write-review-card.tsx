import React from 'react';

interface WriteReviewCardProps {
    isLoggedIn: boolean;
}

const WriteReviewCard: React.FC<WriteReviewCardProps> = ({ isLoggedIn }) => {
    return (
        <div className="card gd-write-review">
            <h3>Write a review</h3>
            {!isLoggedIn && (
                <p className="gd-muted">Sign in to leave a review</p>
            )}
            <div className="gd-review-stars" aria-hidden="true">
                {'★★★★★'}
            </div>
            <textarea
                className="gd-textarea"
                placeholder="Share your experience..."
                disabled={!isLoggedIn}
            />
            <div className="gd-review-options">
                <label className="gd-checkbox">
                    <input type="checkbox" disabled={!isLoggedIn} />
                    I recommend this game
                </label>
                <button className="btn btn-outline" type="button" disabled={!isLoggedIn}>
                    Add screenshots
                </button>
            </div>
            <button className="btn btn-primary" type="button" disabled={!isLoggedIn}>
                Submit
            </button>
        </div>
    );
};

export default WriteReviewCard;
