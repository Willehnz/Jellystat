import React from "react";

function StatComponent(props) {
  return (
    <div className="stats">
      <div className="stats-header">
        <div>{props.heading}</div>
        <div className="stats-header-plays">{props.units}</div>
      </div>

      <div className="stats-list">
        {props.data &&
          props.data.map((item, index) => (
            <div className="stat-item" key={item.Id}>
              <p className="stat-item-index">{index + 1}</p>
              <p className="stat-item-name">{item.Name || item.Client}</p>
              <p className="stat-item-count"> {item.Plays || item.unique_viewers}</p>
            </div>
          ))}
      </div>
    </div>
  );
}

export default StatComponent;
