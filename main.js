const vaccinationsUrl =
  "https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/vaccinations/vaccinations-by-manufacturer.csv";

const width = window.innerWidth;
const height = window.innerHeight * 0.7;
const margin = { left: 10, right: 10, top: 30, bottom: 30 };

const xTicks = 20;

const spinnerOptions = {
  lines: 13, // The number of lines to draw
  length: 60, // The length of each line
  width: 17, // The line thickness
  radius: 80, // The radius of the inner circle
  scale: 1, // Scales overall size of the spinner
  corners: 1, // Corner roundness (0..1)
  speed: 1, // Rounds per second
  rotate: 0, // The rotation offset
  animation: "spinner-line-fade-quick", // The CSS animation name for the lines
  direction: 1, // 1: clockwise, -1: counterclockwise
  color: "#ffffff", // CSS color or array of colors
  fadeColor: "transparent", // CSS color or array of colors
  top: "50%", // Top position relative to parent
  left: "50%", // Left position relative to parent
  shadow: "0 0 1px transparent", // Box-shadow for the lines
  zIndex: 2000000000, // The z-index (defaults to 2e9)
  className: "spinner", // The CSS class to assign to the spinner
  position: "absolute", // Element positioning
};

const findValue = (data, vaccine, date, attribute) => {
  const selectedData = data.filter(
    (d) => d.date.getTime() === date.getTime() && d.vaccine === vaccine
  );
  if (selectedData.length === 0) {
    return 0;
  } else {
    return selectedData[0][attribute];
  }
};

const drawChart = (data, svg, colorScale, xScale) => {
  const stackKeys = Array.from(new Set(data.map((d) => d["vaccine"])).values());

  stackKeys.forEach((d) => {
    const dataByVaccine = data
      .filter((k) => k["vaccine"] === d)
      .sort((a, b) => a.date - b.date)
      .map((t, i, arr) => {
        if (i === 0) {
          t.current_value = t["total_vaccinations"];
        } else {
          const diff =
            t["total_vaccinations"] - arr[i - 1]["total_vaccinations"];
          t.current_value = diff < 0 ? 0 : diff;
        }
        return t;
      });
  });

  const groupedMap = d3.group(
    data,
    (d) => d.date,
    (d) => d["vaccine"]
  );

  const groupedData = Array.from(groupedMap.entries())
    .map((t) => {
      const obj = {};
      obj.date = t[0];
      for (let col of stackKeys) {
        const vals = t[1].get(col);
        obj[col] = !vals
          ? 0
          : vals.reduce((acc, cv) => acc + cv["current_value"], 0);
      }
      return obj;
    })
    .sort((a, b) => a.date - b.date);

  const stackedData = d3
    .stack()
    .keys(stackKeys)
    .order(d3.stackOrderInsideOut)
    .offset(d3.stackOffsetSilhouette)(groupedData);

  const yScale = d3
    .scaleLinear()
    .domain(d3.extent(stackedData.flat(2)))
    .range([height - margin.bottom, margin.top]);

  const xAxisBottom = d3
    .axisBottom(xScale)
    .tickSize(0)
    .tickPadding(5)
    .ticks(xTicks);

  const xAxisBottomGroup = svg
    .selectAll(".x-axis-bottom")
    .data([null])
    .join("g")
    .attr("class", "x-axis-bottom")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(xAxisBottom)
    .call((g) => {
      g.selectAll("line").remove();
      g.selectAll("path").attr("stroke", "#bab8b8");
    });

  const xAxisTop = d3
    .axisTop(xScale)
    .tickSize(-(height - margin.top - margin.bottom))
    .tickPadding(5)
    .ticks(xTicks);

  const xAxisTopGroup = svg
    .selectAll(".x-axis-top")
    .data([null])
    .join("g")
    .attr("class", "x-axis-top")
    .attr("transform", `translate(0, ${margin.top})`)
    .call(xAxisTop)
    .call((g) => {
      g.selectAll("line").attr("stroke", "#bab8b8");
      g.selectAll("path").attr("stroke", "#bab8b8");
    });

  const area = d3
    .area()
    .x((d) => xScale(d.data.date))
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]))
    .curve(d3.curveBasis);

  const tooltip = d3.select("#tooltip");

  const mouseMoved = (e, d) => {
    const vaccinationDates = Array.from(new Set(data.map((d) => d.date)));
    const i = d3.bisect(vaccinationDates, xScale.invert(e.pageX));
    const vaccDate = vaccinationDates[i];

    const vaccValue = findValue(data, d.key, vaccDate, "current_value");
    const totalVacc = findValue(data, d.key, vaccDate, "total_vaccinations");

    const tooltipTitle = `<div>Date: ${d3.timeFormat("%B %d, %Y")(
      vaccDate
    )}</div><div>Vaccine: ${d.key}</div><div>Daily Vaccinations: ${d3.format(
      ","
    )(vaccValue)}</div><div>Total Vaccination: ${d3.format(",")(
      totalVacc
    )}</div>`;

    tooltip
      .style("visibility", "visible")
      .style("top", `${e.pageY}px`)
      .style("left", `${e.pageX}px`)
      .html(tooltipTitle);

    stackedArea.attr("fill-opacity", (t) => (t.key !== d.key ? 0.4 : 1));
  };

  const mouseLeft = () => {
    stackedArea.attr("fill-opacity", 1);
    tooltip.style("visibility", "hidden");
  };

  const chartGroup = svg
    .selectAll(".chart-group")
    .data([null])
    .join("g")
    .attr("class", "chart-group")
    .attr("clip-path", "url(#clip)");

  const handleZoom = (event) => {
    areaGroup.attr("transform", event.transform);
    labels.attr("transform", event.transform);

    xAxisBottomGroup.call(xAxisBottom.scale(event.transform.rescaleX(xScale)));
    xAxisTopGroup.call(xAxisTop.scale(event.transform.rescaleX(xScale)));
  };

  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 32])
    .translateExtent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ])
    .on("zoom", handleZoom);

  svg.call(zoom);

  const areaGroup = chartGroup
    .selectAll(".area-group")
    .data([null])
    .join("g")
    .attr("class", "area-group");

  const stackedArea = areaGroup
    .selectAll(".area-path")
    .data(stackedData)
    .join("path")
    .attr("class", "area-path")
    .attr("fill", (d) => colorScale(d.key))
    .attr("d", area)
    .on("mouseenter mousemove", mouseMoved)
    .on("mouseout", mouseLeft);

  const labels = chartGroup
    .selectAll(".labels")
    .data([null])
    .join("g")
    .attr("class", "labels");

  const labelText = labels
    .selectAll(".label-text")
    .data(stackedData)
    .join("text")
    .attr("class", "label-text")
    .text((d) => d.key)
    .attr("transform", d3.areaLabel(area))
    .attr("fill", "black");
};

const dataParse = (d) => {
  d.date = d3.timeParse("%Y-%m-%d")(d.date);
  d["total_vaccinations"] = +d["total_vaccinations"];
  return d;
};

const main = async () => {
  const spinnerTarget = document.getElementById("spinner");
  const spinner = new Spinner(spinnerOptions).spin(spinnerTarget);
  const vaccinationsData = await d3.csv(vaccinationsUrl, dataParse);
  spinner.stop();

  const locationList = [...new Set(vaccinationsData.map((d) => d.location))];

  const vaccines = Array.from(
    new Set(vaccinationsData.map((d) => d["vaccine"])).values()
  );
  const colorScale = d3
    .scaleOrdinal()
    .domain(vaccines)
    .range(d3.schemeTableau10);

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(vaccinationsData, (d) => d.date))
    .range([margin.left, width - margin.right]);
  const svg = d3
    .select("#main-chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  svg
    .append("defs")
    .append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", width - margin.right - margin.left)
    .attr("height", height - margin.bottom - margin.top);

  jSuites.dropdown(document.getElementById("location"), {
    data: locationList,
    value: "Japan",
    autocomplete: true,
    width: "280px",
    onload: () => {
      drawChart(
        vaccinationsData.filter((t) => t.location === "Japan"),
        svg,
        colorScale,
        xScale
      );
    },
    onchange: (d) => {
      drawChart(
        vaccinationsData.filter((t) => t.location === d.value),
        svg,
        colorScale,
        xScale
      );
    },
  });
};

main();
