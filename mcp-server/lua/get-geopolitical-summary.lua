-- Compute geopolitical summary for a player
-- Returns neighbor distances, border terrain, coastal access, and route connectivity

-- Helper function to get civilization name
local function getCivName(player)
  return player:GetCivilizationShortDescription()
end

-- Helper function to classify a plot's terrain type
local function classifyPlot(plot)
  if not plot then return nil end
  if plot:IsWater() then return "Water" end
  local plotType = plot:GetPlotType()
  if plotType == PlotTypes.PLOT_MOUNTAIN then return "Mountain" end
  if plotType == PlotTypes.PLOT_HILLS then return "Hill" end
  return "Plains"
end

-- Sample plots in a ring around a center point at a given radius
-- Returns terrain percentages
local function sampleBorderTerrain(centerX, centerY, radius)
  local counts = { Mountain = 0, Hill = 0, Plains = 0, Water = 0 }
  local total = 0
  local numSamples = 12

  for i = 0, numSamples - 1 do
    -- Sample at evenly spaced angles around the ring
    local angle = (i / numSamples) * 2 * math.pi
    local sampleX = math.floor(centerX + radius * math.cos(angle) + 0.5)
    local sampleY = math.floor(centerY + radius * math.sin(angle) + 0.5)

    local plot = Map.GetPlot(sampleX, sampleY)
    local terrain = classifyPlot(plot)
    if terrain then
      counts[terrain] = counts[terrain] + 1
      total = total + 1
    end
  end

  -- Convert to percentages
  if total == 0 then
    return { Mountain = 0, Hill = 0, Plains = 0, Water = 0 }
  end

  return {
    Mountain = math.floor((counts.Mountain / total) * 100 + 0.5),
    Hill = math.floor((counts.Hill / total) * 100 + 0.5),
    Plains = math.floor((counts.Plains / total) * 100 + 0.5),
    Water = math.floor((counts.Water / total) * 100 + 0.5)
  }
end

-- Determine route connectivity between two capitals by sampling plots along the path
local function getRouteType(x1, y1, x2, y2)
  local waterCount = 0
  local landCount = 0
  local numSamples = 10

  for i = 1, numSamples do
    local t = i / (numSamples + 1)
    local sampleX = math.floor(x1 + (x2 - x1) * t + 0.5)
    local sampleY = math.floor(y1 + (y2 - y1) * t + 0.5)

    local plot = Map.GetPlot(sampleX, sampleY)
    if plot then
      if plot:IsWater() then
        waterCount = waterCount + 1
      else
        landCount = landCount + 1
      end
    end
  end

  if waterCount == 0 then return "Land" end
  if landCount == 0 then return "Sea" end
  return "Mixed"
end

Game.RegisterFunction("${Name}", function(${Arguments})
  local player = Players[playerID]
  if not player or not player:IsAlive() then
    return { Neighbors = {}, OurCoastalCities = 0, OurTotalCities = 0 }
  end

  local ourCapital = player:GetCapitalCity()
  if not ourCapital then
    return { Neighbors = {}, OurCoastalCities = 0, OurTotalCities = 0 }
  end

  local ourX = ourCapital:GetX()
  local ourY = ourCapital:GetY()
  local teamID = player:GetTeam()
  local fromTeam = Teams[teamID]

  -- Count our coastal cities
  local ourCoastalCities = 0
  local ourTotalCities = player:GetNumCities()
  for city in player:Cities() do
    if city:IsCoastal() then
      ourCoastalCities = ourCoastalCities + 1
    end
  end

  -- Compute neighbor data for each met major civilization
  local neighbors = {}

  for otherID = 0, GameDefines.MAX_MAJOR_CIVS - 1 do
    if otherID ~= playerID then
      local otherPlayer = Players[otherID]
      if otherPlayer and otherPlayer:IsAlive() and fromTeam:IsHasMet(otherPlayer:GetTeam()) then
        local otherCapital = otherPlayer:GetCapitalCity()
        if otherCapital then
          local otherX = otherCapital:GetX()
          local otherY = otherCapital:GetY()

          -- Capital-to-capital distance
          local distance = Map.PlotDistance(ourX, ourY, otherX, otherY)

          -- Border terrain: sample at roughly half the distance between capitals
          local midX = math.floor((ourX + otherX) / 2 + 0.5)
          local midY = math.floor((ourY + otherY) / 2 + 0.5)
          local sampleRadius = math.max(2, math.floor(distance / 4 + 0.5))
          local borderTerrain = sampleBorderTerrain(midX, midY, sampleRadius)

          -- Coastal access: check if the other player has at least one coastal city
          local hasCoastalCity = false
          for city in otherPlayer:Cities() do
            if city:IsCoastal() then
              hasCoastalCity = true
              break
            end
          end

          -- Route connectivity
          local routeType = getRouteType(ourX, ourY, otherX, otherY)

          neighbors[getCivName(otherPlayer)] = {
            CapitalDistance = distance,
            BorderTerrain = borderTerrain,
            HasCoastalCity = hasCoastalCity,
            RouteType = routeType
          }
        end
      end
    end
  end

  return {
    Neighbors = neighbors,
    OurCoastalCities = ourCoastalCities,
    OurTotalCities = ourTotalCities
  }
end)

return true
