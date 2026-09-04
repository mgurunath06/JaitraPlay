interface Activity {
  activityId: string;
  title: string;
}

export function Hub({ activities }: { activities: Activity[] }) {
  return (
    <section className="panel hub" aria-labelledby="games-title">
      <p className="eyebrow">Pick a picture</p>
      <h1 id="games-title">What shall we play?</h1>
      <div className="activity-grid">
        {activities.map((activity) => (
          <div className="activity-card" key={activity.activityId}>
            <span className="activity-icon" aria-hidden="true">🐘</span>
            <span>{activity.title}</span>
            <small>Coming in the next play build</small>
          </div>
        ))}
      </div>
    </section>
  );
}
