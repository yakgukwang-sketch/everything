import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

const API_URL = "http://localhost:8787";

type Restaurant = {
  id: number;
  name: string;
  address: string;
  category: string;
  rating: number;
  review_count: number;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/restaurants?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setResults(data.data || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>everything</Text>
      <Text style={styles.subtitle}>모든 로컬 서비스, 하나의 검색</Text>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="강남 맛집, 부산 숙소, 근처 카페..."
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.button}
          onPress={handleSearch}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "..." : "검색"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.category}>{item.category}</Text>
            </View>
            <Text style={styles.address}>{item.address}</Text>
            <Text style={styles.rating}>
              ★ {item.rating} ({item.review_count}개 리뷰)
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 100,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
  },
  subtitle: {
    color: "#666",
    marginBottom: 30,
    fontSize: 16,
  },
  searchBox: {
    flexDirection: "row",
    width: "100%",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#000",
    borderRadius: 50,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  list: {
    width: "100%",
    marginTop: 20,
  },
  card: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
  },
  category: {
    color: "#999",
  },
  address: {
    color: "#666",
    fontSize: 14,
    marginTop: 4,
  },
  rating: {
    color: "#f59e0b",
    fontSize: 14,
    marginTop: 2,
  },
});
